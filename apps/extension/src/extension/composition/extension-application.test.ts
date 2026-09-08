import "fake-indexeddb/auto";
import type {
  RawMasterPassword,
  VaultSnapshot,
  SyncSetupInput,
  SyncAccess,
  VaultSyncResolution,
} from "@lfspm/core";
import {
  areVaultSnapshotIdentitiesEqual,
  PasswordEntryChangedError,
  toVaultSnapshotDescriptor,
  toVaultSnapshotIdentity,
} from "@lfspm/core";
import { AwsS3SyncProviderAdapter } from "../../adapters/sync/aws-s3-sync-provider.adapter";
import { WebCryptoAdapter } from "../../adapters/crypto/web-crypto.adapter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createChromeStorageArea } from "../../__tests__/fixtures/chrome-storage-area";
import type { WebLockManager } from "../../adapters/clipboard";
import { parseScheduledTask } from "../../adapters/system";
import { createVaultManagerDb } from "../../infrastructure/database/dexie-db";
import { composeScheduledTaskAlarmHandler } from "../background/clipboard-alarm-runtime";
import { composeExtensionApplication } from "./extension-application";

const masterPassword = "Cedar!Orbit-72-Bright-River" as RawMasterPassword;
let database: ReturnType<typeof createVaultManagerDb>;

function installBrowser() {
  const { storageArea } = createChromeStorageArea();
  const queues = new Map<string, Promise<unknown>>();
  const locks: WebLockManager = {
    request: (name, operation) => {
      const previous = queues.get(name) ?? Promise.resolve();
      const result = previous.then(() => operation(null));
      queues.set(
        name,
        result.catch(() => undefined),
      );
      return result;
    },
  };
  const alarms = new Map<string, { readonly when: number }>();
  const create = vi.fn(
    async (name: string, info: { readonly when: number }) => {
      alarms.set(name, info);
    },
  );
  const clear = vi.fn(async (name: string) => alarms.delete(name));
  let clipboardText = "unrelated clipboard";
  const sendMessage = vi.fn(async (message: unknown) => {
    if (typeof message !== "object" || message === null) {
      throw new Error("Expected a clipboard request.");
    }
    if ("operation" in message && message.operation === "read") {
      return { ok: true, value: clipboardText };
    }
    if ("value" in message && typeof message.value === "string") {
      clipboardText = message.value;
      return { ok: true };
    }
    throw new Error("Unexpected clipboard request.");
  });
  const createDocument = vi.fn(async () => undefined);
  vi.stubGlobal("navigator", { locks });
  vi.stubGlobal("chrome", {
    permissions: { contains: async () => true },
    storage: { session: storageArea },
    alarms: { create, clear },
    offscreen: { createDocument },
    runtime: {
      getURL: (path: string) => `chrome-extension://test/${path}`,
      getContexts: async () => [{}],
      sendMessage,
    },
  });
  const fetch = vi.fn(async () => {
    throw new Error("Unexpected network request.");
  });
  vi.stubGlobal("fetch", fetch);
  return {
    alarms,
    create,
    clear,
    createDocument,
    sendMessage,
    fetch,
    clipboard: () => clipboardText,
  };
}

beforeEach(() => {
  database = createVaultManagerDb(`composition-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await database.delete();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("production extension composition", () => {
  it("constructs without opening storage, starting workflows, or accessing the clipboard/network", () => {
    const browser = installBrowser();
    composeExtensionApplication(database);

    expect(database.isOpen()).toBe(false);
    expect(browser.create).not.toHaveBeenCalled();
    expect(browser.sendMessage).not.toHaveBeenCalled();
    expect(browser.createDocument).not.toHaveBeenCalled();
    expect(browser.fetch).not.toHaveBeenCalled();
  });

  it("replaces recovery words without losing password access, and copies only current words", async () => {
    const browser = installBrowser();
    const app = composeExtensionApplication(database);
    const initial = await app.initializeVault.execute({
      masterPassword,
      deviceName: "Recovery test",
      lockAfterMs: 60_000,
    });
    const status = await app.getVaultSessionStatus.execute();
    if (status.status !== "unlocked")
      throw new Error("Expected unlocked vault");
    const { vaultId } = status;
    const replaced = await app.replaceRecoveryWords.execute({ vaultId });
    expect(replaced.recoveryMnemonicKey.words).toHaveLength(24);
    expect(replaced.recoveryMnemonicKey.words).not.toEqual(
      initial.recoveryMnemonicKey.words,
    );
    await expect(
      app.copyRecoveryWords.execute({
        vaultId,
        mnemonic: initial.recoveryMnemonicKey,
      }),
    ).rejects.toThrow();
    expect(browser.clipboard()).toBe("unrelated clipboard");
    await app.copyRecoveryWords.execute({
      vaultId,
      mnemonic: replaced.recoveryMnemonicKey,
    });
    expect(browser.clipboard()).toBe(
      replaced.recoveryMnemonicKey.words.join(" "),
    );
    await app.lockVault.execute();
    expect(browser.clipboard()).toBe("");
    await expect(
      app.replaceRecoveryWords.execute({ vaultId }),
    ).rejects.toThrow();
    await expect(
      app.copyRecoveryWords.execute({
        vaultId,
        mnemonic: replaced.recoveryMnemonicKey,
      }),
    ).rejects.toThrow();
    await app.unlockVault.execute({
      vaultId,
      masterPassword,
      lockAfterMs: 60_000,
    });
    expect(await app.getVaultSessionStatus.execute()).toEqual({
      status: "unlocked",
      vaultId,
    });
    expect((await app.listLocalVaults.execute()).vaults).toHaveLength(1);
    await app.lockVault.execute();
    const replacementPassword =
      "Orbit!Cedar-91-Quiet-Valley" as RawMasterPassword;
    await app.recoverDeviceAccess.execute({
      vaultId,
      recoveryMnemonicKey: replaced.recoveryMnemonicKey,
      newMasterPassword: replacementPassword,
    });
    await app.unlockVault.execute({
      vaultId,
      masterPassword: replacementPassword,
      lockAfterMs: 60_000,
    });
    expect(await app.getVaultSessionStatus.execute()).toEqual({
      status: "unlocked",
      vaultId,
    });
  });

  it("persists a vault and coordinates session replacement, clipboard cleanup, and background locking", async () => {
    const browser = installBrowser();
    const app = composeExtensionApplication(database);
    await expect(app.listLocalVaults.execute()).resolves.toEqual({
      vaults: [],
    });
    await app.initializeVault.execute({
      masterPassword,
      deviceName: "Composition test",
      lockAfterMs: 60_000,
    });
    const status = await app.getVaultSessionStatus.execute();
    expect(status.status).toBe("unlocked");
    if (status.status !== "unlocked") {
      throw new Error("Initialization must activate a session.");
    }
    const { vaultId } = status;
    expect((await app.listLocalVaults.execute()).vaults).toEqual([
      expect.objectContaining({ vaultId }),
    ]);
    const firstLockAlarm = [...browser.alarms.keys()].find(
      (name) => parseScheduledTask(name)?.name === "lockVault",
    );
    expect(firstLockAlarm).toBeDefined();

    const entryPassword = "entry-password-for-composition";
    const { entryId } = await app.addEntry.execute({
      vaultId,
      allowWeakPassword: true,
      entry: {
        password: entryPassword,
        login: "alice",
        tags: [],
        url: "https://example.com",
      },
    });
    await app.copyEntryPassword.execute({
      vaultId,
      entryId,
      clearAfterMs: 30_000,
    });
    expect(browser.clipboard()).toBe(entryPassword);
    await app.lockVault.execute();
    expect(browser.clipboard()).toBe("");
    expect(browser.alarms.size).toBe(0);
    await expect(app.getVaultSessionStatus.execute()).resolves.toEqual({
      status: "locked",
    });

    await app.unlockVault.execute({
      vaultId,
      masterPassword,
      lockAfterMs: 60_000,
    });
    const currentLockAlarm = [...browser.alarms.keys()][0];
    expect(currentLockAlarm).toBeDefined();
    expect(currentLockAlarm).not.toBe(firstLockAlarm);
    // A fresh graph models a restarted worker. It must see the persisted session
    // and reject an alarm belonging to the previous activation.
    const handleAlarm = composeScheduledTaskAlarmHandler(database);
    await handleAlarm({ name: firstLockAlarm! });
    await expect(app.getVaultSessionStatus.execute()).resolves.toEqual({
      status: "unlocked",
      vaultId,
    });
    await handleAlarm({ name: currentLockAlarm! });
    await expect(app.getVaultSessionStatus.execute()).resolves.toEqual({
      status: "locked",
    });
    expect(browser.alarms.size).toBe(0);

    // Another application context can reopen the persisted vault and delete it.
    const reopened = composeExtensionApplication(database);
    await reopened.unlockVault.execute({
      vaultId,
      masterPassword,
      lockAfterMs: 60_000,
    });
    await expect(
      reopened.getEntryPassword.execute({ vaultId, entryId }),
    ).resolves.toEqual({ password: entryPassword });
    await reopened.deleteLocalVault.execute({ vaultId });
    await expect(app.listLocalVaults.execute()).resolves.toEqual({
      vaults: [],
    });
    await expect(app.getVaultSessionStatus.execute()).resolves.toEqual({
      status: "locked",
    });
    expect(browser.fetch).not.toHaveBeenCalled();
  }, 30_000);

  it("rolls initialization back if Chrome cannot install the lock alarm", async () => {
    const browser = installBrowser();
    const app = composeExtensionApplication(database);
    browser.create.mockRejectedValue(new Error("Alarm unavailable"));

    await expect(
      app.initializeVault.execute({
        masterPassword,
        deviceName: "Failed activation",
        lockAfterMs: 60_000,
      }),
    ).rejects.toThrow();
    await expect(app.getVaultSessionStatus.execute()).resolves.toEqual({
      status: "locked",
    });
    await expect(app.listLocalVaults.execute()).resolves.toEqual({
      vaults: [],
    });
    expect(await database.encryptedUnlockedVaultSessionPayloads.count()).toBe(
      0,
    );
    expect(browser.clipboard()).toBe("unrelated clipboard");
  }, 15_000);
  it("converges between enrolled devices, rejects stale forms, and repairs credentials after a lost upload response", async () => {
    const cryptoAdapter = new WebCryptoAdapter();
    let remote: VaultSnapshot | null = null;
    let loseNextResponse = false;
    let rejectOriginalCredentials = false;
    const syncConfig = {
      provider: "aws-s3-v1",
      providerConfig: {
        target: {
          bucket: "sync-test-bucket",
          region: "eu-central-1",
          prefix: "vaults/",
        },
        credentials: {
          accessKeyId: "test-original-key",
          secretAccessKey: "test-original-secret",
        },
      },
    } satisfies SyncSetupInput;
    const replacement = {
      ...syncConfig,
      providerConfig: {
        ...syncConfig.providerConfig,
        credentials: {
          accessKeyId: "test-replacement-key",
          secretAccessKey: "test-replacement-secret",
        },
      },
    };
    const requireAccess = (access: SyncAccess) => {
      if (
        rejectOriginalCredentials &&
        JSON.stringify(access.credentials.credentialsConfig) ===
          JSON.stringify(syncConfig.providerConfig.credentials)
      )
        throw new Error("Authentication rejected");
    };
    vi.spyOn(
      AwsS3SyncProviderAdapter.prototype,
      "getLatestVaultSnapshotDescriptor",
    ).mockImplementation(async (access, vaultId) => {
      requireAccess(access);
      return remote === null
        ? null
        : toVaultSnapshotDescriptor(vaultId, remote);
    });
    vi.spyOn(
      AwsS3SyncProviderAdapter.prototype,
      "downloadVaultSnapshot",
    ).mockImplementation(async (access) => {
      requireAccess(access);
      if (remote === null) throw new Error("Remote snapshot missing");
      return structuredClone(remote);
    });
    vi.spyOn(
      AwsS3SyncProviderAdapter.prototype,
      "checkVaultAccess",
    ).mockImplementation(async (access) => {
      try {
        requireAccess(access);
        return "accessible";
      } catch {
        return "authentication_rejected";
      }
    });
    const upload = vi
      .spyOn(AwsS3SyncProviderAdapter.prototype, "prepareVaultSnapshotUpload")
      .mockImplementation(async (access, snapshot, expected) => {
        requireAccess(access);
        const before = remote;
        const actual =
          before === null
            ? null
            : toVaultSnapshotIdentity(
                before.metadata.id,
                before,
                await cryptoAdapter.digestVaultSnapshot(before),
              );
        if (
          (actual === null) !== (expected === null) ||
          (actual !== null &&
            expected !== null &&
            !areVaultSnapshotIdentitiesEqual(actual, expected))
        ) {
          return {
            status: "not_started",
            outcome: {
              status: "definitely_not_committed",
              reason: "remote_snapshot_changed",
            },
          };
        }
        return {
          status: "ready",
          start: () => {
            if (remote !== before)
              return {
                outcome: Promise.resolve({
                  status: "definitely_not_committed",
                  reason: "remote_snapshot_changed",
                }),
              };
            remote = structuredClone(snapshot);
            const status = loseNextResponse ? "outcome_unknown" : "committed";
            loseNextResponse = false;
            return { outcome: Promise.resolve({ status }) };
          },
        };
      });
    const browserA = installBrowser();
    const chromeA = globalThis.chrome;
    const navigatorA = globalThis.navigator;
    const deviceA = composeExtensionApplication(database);
    await deviceA.initializeVault.execute({
      masterPassword,
      deviceName: "Device A",
      lockAfterMs: 60_000,
    });
    const status = await deviceA.getVaultSessionStatus.execute();
    if (status.status !== "unlocked")
      throw new Error("Expected unlocked vault");
    const { vaultId } = status;
    await deviceA.setupSync.execute({ vaultId, syncConfig });
    const snapshot = remote as VaultSnapshot | null;
    if (snapshot === null) throw new Error("Expected uploaded vault");
    const genesisDigest = await cryptoAdapter.digestVaultTrustCertificate(
      snapshot.trustChain.certificates[0],
    );
    const databaseB = createVaultManagerDb(
      `sync-device-b-${crypto.randomUUID()}`,
    );
    try {
      const browserB = installBrowser();
      const chromeB = globalThis.chrome;
      const navigatorB = globalThis.navigator;
      const activateA = () => {
        vi.stubGlobal("chrome", chromeA);
        vi.stubGlobal("navigator", navigatorA);
      };
      const activateB = () => {
        vi.stubGlobal("chrome", chromeB);
        vi.stubGlobal("navigator", navigatorB);
      };
      const deviceB = composeExtensionApplication(databaseB);
      const request = await deviceB.createDeviceEnrollmentRequest.execute({
        vaultId,
        expectedGenesisCertificateDigest: genesisDigest,
        masterPassword,
      });
      activateA();
      const authorization = await deviceA.initializeDeviceEnrollment.execute({
        vaultId,
        request,
      });
      activateB();
      await deviceB.performDeviceEnrollment.execute({
        enrollmentResponse: authorization.enrollmentResponse,
        masterPassword,
        deviceName: "Device B",
        syncConfig,
        lockAfterMs: 60_000,
      });
      const acceptRemote = async (app: typeof deviceA) => {
        const review = await app.prepareSyncReview.execute({ vaultId });
        if (review.review === null) return;
        const { actionable } = review.review;
        const resolution: VaultSyncResolution = {
          entryResolutions: actionable.entryReviews.map((item) => ({
            entryId: item.entryId,
            action: "use_remote",
          })),
          tagResolutions: actionable.tagReviews.map((item) => ({
            tagId: item.tagId,
            action: "use_remote",
          })),
          deviceProfileResolutions: actionable.deviceProfileReviews.map(
            (item) => ({ deviceId: item.deviceId, action: "use_remote" }),
          ),
        };
        await app.applySyncResolution.execute({
          vaultId,
          reviewedSnapshotIdentities: review.reviewedSnapshotIdentities,
          resolution,
        });
      };
      activateA();
      await acceptRemote(deviceA);
      const { entryId } = await deviceA.addEntry.execute({
        vaultId,
        allowWeakPassword: true,
        entry: {
          password: "original",
          login: "alice",
          tags: [],
          url: "https://example.test",
        },
      });
      const stale = await deviceA.readEntry.execute({ vaultId, entryId });
      activateB();
      await acceptRemote(deviceB);
      const readB = await deviceB.readEntry.execute({ vaultId, entryId });
      await deviceB.updateEntry.execute({
        vaultId,
        entryId,
        expectedEntryVersionVector: readB.entryVersionVector,
        allowWeakPassword: true,
        entry: {
          password: "newer",
          login: "bob",
          tags: [],
          url: "https://example.test",
        },
      });
      activateA();
      await acceptRemote(deviceA);
      const uploadCount = upload.mock.calls.length;
      for (let round = 0; round < 3; round += 1) {
        activateA();
        await expect(
          deviceA.prepareSyncReview.execute({ vaultId }),
        ).resolves.toMatchObject({ relation: "equal", review: null });
        activateB();
        await expect(
          deviceB.prepareSyncReview.execute({ vaultId }),
        ).resolves.toMatchObject({ relation: "equal", review: null });
      }
      expect(upload).toHaveBeenCalledTimes(uploadCount);
      activateA();
      await expect(
        deviceA.updateEntry.execute({
          vaultId,
          entryId,
          expectedEntryVersionVector: stale.entryVersionVector,
          allowWeakPassword: true,
          entry: {
            password: "original",
            login: "alice",
            tags: [],
            url: "https://example.test",
          },
        }),
      ).rejects.toBeInstanceOf(PasswordEntryChangedError);
      await expect(
        deviceA.removeEntry.execute({
          vaultId,
          entryId,
          expectedEntryVersionVector: stale.entryVersionVector,
        }),
      ).rejects.toBeInstanceOf(PasswordEntryChangedError);
      expect(upload).toHaveBeenCalledTimes(uploadCount);
      const current = await deviceA.readEntry.execute({ vaultId, entryId });
      loseNextResponse = true;
      await expect(
        deviceA.removeEntry.execute({
          vaultId,
          entryId,
          expectedEntryVersionVector: current.entryVersionVector,
        }),
      ).resolves.toMatchObject({ syncUpload: "pending" });
      const snapshotBefore = await database.vaultSnapshots.get(vaultId);
      const checkpointBefore =
        await database.localVaultTrustCheckpoints.get(vaultId);
      const credentialsBefore =
        await database.deviceSyncCredentialStates.get(vaultId);
      rejectOriginalCredentials = true;
      await expect(
        deviceA.prepareSyncReview.execute({ vaultId }),
      ).rejects.toThrow("Authentication rejected");
      await deviceA.updateSyncCredentials.execute({
        vaultId,
        syncConfig: replacement,
      });
      expect(await database.vaultSnapshots.get(vaultId)).toEqual(
        snapshotBefore,
      );
      expect(await database.localVaultTrustCheckpoints.get(vaultId)).toEqual(
        checkpointBefore,
      );
      const repaired = await database.deviceSyncCredentialStates.get(vaultId);
      expect(repaired).not.toEqual(credentialsBefore);
      expect(JSON.stringify(repaired)).not.toContain("test-replacement-secret");
      const uploadsBeforeRetry = upload.mock.calls.length;
      await deviceA.syncUpload.execute({ vaultId });
      expect(upload).toHaveBeenCalledTimes(uploadsBeforeRetry);
      await expect(
        deviceA.prepareSyncReview.execute({ vaultId }),
      ).resolves.toMatchObject({ relation: "equal", review: null });
      activateB();
      await deviceB.updateSyncCredentials.execute({
        vaultId,
        syncConfig: replacement,
      });
      await acceptRemote(deviceB);
      await expect(
        deviceB.readEntry.execute({ vaultId, entryId }),
      ).rejects.toThrow();
      await expect(
        deviceB.prepareSyncReview.execute({ vaultId }),
      ).resolves.toMatchObject({ relation: "equal", review: null });
      await deviceB.lockVault.execute();
      activateA();
      let notifyProbeStarted!: () => void;
      const probeStarted = new Promise<void>((resolve) => {
        notifyProbeStarted = resolve;
      });
      let releaseProbe!: () => void;
      const finishProbe = new Promise<void>((resolve) => {
        releaseProbe = resolve;
      });
      vi.spyOn(
        AwsS3SyncProviderAdapter.prototype,
        "checkVaultAccess",
      ).mockImplementationOnce(async () => {
        notifyProbeStarted();
        await finishProbe;
        return "accessible";
      });
      const credentialsBeforeLock =
        await database.deviceSyncCredentialStates.get(vaultId);
      const blockedRepair = deviceA.updateSyncCredentials.execute({
        vaultId,
        syncConfig: replacement,
      });
      await probeStarted;
      await deviceA.lockVault.execute();
      releaseProbe();
      await expect(blockedRepair).rejects.toThrow();
      expect(await database.deviceSyncCredentialStates.get(vaultId)).toEqual(
        credentialsBeforeLock,
      );
      await deviceA.unlockVault.execute({
        vaultId,
        masterPassword,
        lockAfterMs: 60_000,
      });
      await expect(
        deviceA.prepareSyncReview.execute({ vaultId }),
      ).resolves.toMatchObject({ relation: "equal", review: null });
      expect(browserA.fetch).not.toHaveBeenCalled();
      expect(browserB.fetch).not.toHaveBeenCalled();
    } finally {
      await databaseB.delete();
    }
  }, 30_000);
});
