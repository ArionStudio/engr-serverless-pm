import "fake-indexeddb/auto";
import type { RawMasterPassword } from "@lfspm/core";
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
});
