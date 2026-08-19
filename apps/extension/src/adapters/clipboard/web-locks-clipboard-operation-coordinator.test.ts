import {
  ClearClipboardTaskUseCase,
  CopyEntryPasswordUseCase,
  CURRENT_ALGORITHM_SUITE,
  LockVaultUseCase,
  type ClipboardPort,
  type DevicePublicSignKey,
  type DeviceVaultPublicKey,
  type UnlockedVault,
} from "@lfspm/core";
import {
  decodeBase64Url,
  encodeBase64Url,
  type Base64URLString,
} from "@lfspm/core/lib";
import {
  ClipboardClearService,
  UnlockedVaultSessionService,
  VaultLifecycleCleanupService,
  VaultSessionActivationService,
} from "@lfspm/core/services";
import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../../../../packages/core/src/__tests__/fixtures/ports";
import { createCoreTestValues } from "../../../../../packages/core/src/__tests__/fixtures/values";
import {
  createUnlockedVaultWithEntries,
  saveUnlockedVaultWithEntries,
  singlePasswordEntry,
} from "../../../../../packages/core/src/__tests__/fixtures/vault-entries";
import { createChromeStorageArea } from "../../__tests__/fixtures/chrome-storage-area";
import { ChromeClipboardClearTaskRepository } from "../storage/chrome-clipboard-clear-task.repository";
import {
  ChromeUnlockedVaultSessionMaterialRepository,
  UNLOCKED_VAULT_SESSION_MATERIAL_STORAGE_KEY,
} from "../storage/chrome-unlocked-vault-session-material.repository";
import {
  CLIPBOARD_OPERATION_LOCK_NAME,
  type WebLockManager,
  WebLocksClipboardOperationCoordinator,
} from "./web-locks-clipboard-operation-coordinator";
import { WebCryptoClipboardSecretHash } from "./web-crypto-clipboard-secret-hash";

const ED25519_PUBLIC_KEY =
  "Fqs-ZEF094DwnmgIP_3vW66vR7a3roKY4a6rHcf_Mbg" as Base64URLString;
const ED25519_PRIVATE_KEY =
  "MC4CAQAwBQYDK2VwBCIEIKCpkcLGPXOj3QmuhXSqbSzyR9QxZsgQRcHKuEBgvBGS" as Base64URLString;
const P256_PUBLIC_KEY =
  "BGHA1gXNkZGy7nD5xmWFenBCQYwNDXk_JvqcNfVsq9rQ4951gUvzZy3aDWK6yj5FRZqAimQvURlj6i-I8aYbzNg" as Base64URLString;
const P256_PRIVATE_KEY =
  "MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgWiqUpCPje41XhU_gfBax1XuzrKagNbTrY97LNjclW2ehRANCAARhwNYFzZGRsu5w-cZlhXpwQkGMDQ15Pyb6nDX1bKva0OPedYFL82ct2g1iuso-RUWagIpkL1EZY-oviPGmG8zY" as Base64URLString;

type TestValues = ReturnType<typeof createCoreTestValues>;
type TestPorts = ReturnType<typeof createCoreTestPorts>;

function createStrictSessionTestPorts(values: TestValues): TestPorts {
  const ports = createCoreTestPorts(values);
  vi.mocked(
    ports.crypto.generateUnlockedVaultSessionPayloadKey,
  ).mockResolvedValue(
    filledBuffer(
      5,
      CURRENT_ALGORITHM_SUITE.unlockedVaultSessionPayloadKeyGeneration
        .byteLength,
    ) as Awaited<
      ReturnType<typeof ports.crypto.generateUnlockedVaultSessionPayloadKey>
    >,
  );
  return ports;
}

function createStrictUnlockedVaultWithEntries(
  values: TestValues,
  entries: Parameters<typeof createUnlockedVaultWithEntries>[1],
  vaultId = values.vaultId,
): UnlockedVault {
  const unlockedVault = createUnlockedVaultWithEntries(values, entries);
  const certificateDigest = digest(3);
  const publicSignKey = decodeBuffer(ED25519_PUBLIC_KEY) as DevicePublicSignKey;

  return {
    ...unlockedVault,
    vaultId,
    vaultMasterKey: filledBuffer(
      1,
      CURRENT_ALGORITHM_SUITE.vaultMasterKeyGeneration.keyLengthBits / 8,
    ) as typeof unlockedVault.vaultMasterKey,
    devicePrivateSignKey: decodeBuffer(
      ED25519_PRIVATE_KEY,
    ) as typeof unlockedVault.devicePrivateSignKey,
    devicePrivateVaultKey: decodeBuffer(
      P256_PRIVATE_KEY,
    ) as typeof unlockedVault.devicePrivateVaultKey,
    deviceLocalProtectionKey: filledBuffer(
      2,
      CURRENT_ALGORITHM_SUITE.deviceLocalProtectionKeyGeneration.byteLength,
    ) as typeof unlockedVault.deviceLocalProtectionKey,
    trustedSnapshotContext: {
      snapshotDigest: digest(4),
      trust: {
        ...unlockedVault.trustedSnapshotContext.trust,
        certificateDigest,
        trustedDevices: [
          {
            deviceId: values.deviceId,
            publicSignKey,
            publicVaultKey: decodeBuffer(
              P256_PUBLIC_KEY,
            ) as DeviceVaultPublicKey,
          },
        ],
      },
    },
    vaultTrustAnchor: {
      ...unlockedVault.vaultTrustAnchor,
      vaultId,
      genesisPublicSignKey: publicSignKey.slice() as DevicePublicSignKey,
      genesisCertificateDigest: certificateDigest,
    },
  };
}

function filledBuffer(value: number, byteLength: number): ArrayBuffer {
  return new Uint8Array(byteLength).fill(value).buffer;
}

function decodeBuffer(value: Base64URLString): ArrayBuffer {
  return decodeBase64Url(value).slice().buffer;
}

function digest(value: number): string {
  return encodeBase64Url(new Uint8Array(32).fill(value));
}

class SerializedWebLockManager implements WebLockManager {
  readonly requestedNames: string[] = [];
  private tail: Promise<void> = Promise.resolve();

  request<T>(
    name: string,
    callback: (lock: Lock | null) => Promise<T>,
  ): Promise<T> {
    this.requestedNames.push(name);
    const previous = this.tail;
    let release = (): void => undefined;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });

    return previous.then(() => callback(null)).finally(release);
  }
}

function createDeferred() {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

describe("WebLocksClipboardOperationCoordinator", () => {
  it("serializes independent adapter instances around shared task storage", async () => {
    const hashA = "a".repeat(64);
    const hashB = "b".repeat(64);
    const lockManager = new SerializedWebLockManager();
    const coordinatorA = new WebLocksClipboardOperationCoordinator(lockManager);
    const coordinatorB = new WebLocksClipboardOperationCoordinator(lockManager);
    const { storageArea } = createChromeStorageArea();
    const repository = new ChromeClipboardClearTaskRepository(storageArea);
    const firstStarted = createDeferred();
    const releaseFirst = createDeferred();
    let secondStarted = false;

    const firstOperation = coordinatorA.runExclusive(async () => {
      await repository.save({
        actionId: "action-a",
        copiedValueHash: hashA,
        expiresAt: 1_000,
      });
      firstStarted.resolve();
      await releaseFirst.promise;

      await expect(repository.get()).resolves.toEqual({
        actionId: "action-a",
        copiedValueHash: hashA,
        expiresAt: 1_000,
      });
    });

    await firstStarted.promise;

    const secondOperation = coordinatorB.runExclusive(async () => {
      secondStarted = true;
      await repository.save({
        actionId: "action-b",
        copiedValueHash: hashB,
        expiresAt: 2_000,
      });
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(secondStarted).toBe(false);
    releaseFirst.resolve();
    await Promise.all([firstOperation, secondOperation]);

    expect(secondStarted).toBe(true);
    expect(lockManager.requestedNames).toEqual([
      CLIPBOARD_OPERATION_LOCK_NAME,
      CLIPBOARD_OPERATION_LOCK_NAME,
    ]);
    await expect(repository.get()).resolves.toEqual({
      actionId: "action-b",
      copiedValueHash: hashB,
      expiresAt: 2_000,
    });
  });

  it("returns values and preserves operation failures", async () => {
    const lockManager = new SerializedWebLockManager();
    const coordinator = new WebLocksClipboardOperationCoordinator(lockManager);
    const error = new Error("operation failed");

    await expect(coordinator.runExclusive(async () => "result")).resolves.toBe(
      "result",
    );
    await expect(
      coordinator.runExclusive(async () => {
        throw error;
      }),
    ).rejects.toBe(error);
  });

  it("keeps each lease active only during its own lock callback", async () => {
    const coordinator = new WebLocksClipboardOperationCoordinator(
      new SerializedWebLockManager(),
    );
    let capturedLease: Parameters<typeof coordinator.isLeaseActive>[0] | null =
      null;

    await coordinator.runExclusive(async (lease) => {
      capturedLease = lease;
      expect(coordinator.isLeaseActive(lease)).toBe(true);
    });

    expect(capturedLease).not.toBeNull();
    expect(coordinator.isLeaseActive(capturedLease!)).toBe(false);
  });

  it("rejects an independently authorized activation after another context activates", async () => {
    const values = createCoreTestValues();
    const portsA = createStrictSessionTestPorts(values);
    const portsB = createStrictSessionTestPorts(values);
    const lockManager = new SerializedWebLockManager();
    const coordinatorA = new WebLocksClipboardOperationCoordinator(lockManager);
    const coordinatorB = new WebLocksClipboardOperationCoordinator(lockManager);
    const { storageArea } = createChromeStorageArea();
    const materialRepositoryA =
      new ChromeUnlockedVaultSessionMaterialRepository(storageArea);
    const materialRepositoryB =
      new ChromeUnlockedVaultSessionMaterialRepository(storageArea);
    const sessionA = new UnlockedVaultSessionService(
      materialRepositoryA,
      portsA.encryptedUnlockedVaultSessionPayloadRepository,
      portsA.crypto,
      portsA.ids,
      coordinatorA,
    );
    const sessionB = new UnlockedVaultSessionService(
      materialRepositoryB,
      portsB.encryptedUnlockedVaultSessionPayloadRepository,
      portsB.crypto,
      portsB.ids,
      coordinatorB,
    );
    const vaultA = createStrictUnlockedVaultWithEntries(values, []);
    const vaultB = createStrictUnlockedVaultWithEntries(
      values,
      [],
      "other-vault-id",
    );
    await materialRepositoryB.removeUnlockedVaultSessionMaterial();
    const generationA = await sessionA.requireVaultCanBeActivated(
      vaultA.vaultId,
    );
    const generationB = await sessionB.requireVaultCanBeActivated(
      vaultB.vaultId,
    );
    vi.mocked(portsA.ids.generateId)
      .mockReset()
      .mockResolvedValueOnce("lock-action-a")
      .mockResolvedValueOnce("session-a");
    vi.mocked(portsB.ids.generateId)
      .mockReset()
      .mockResolvedValueOnce("lock-action-b")
      .mockResolvedValueOnce("session-b");
    const activationA = new VaultSessionActivationService(
      portsA.clock,
      portsA.ids,
      portsA.scheduledTasks,
      portsA.vaultLockTasks,
      sessionA,
      coordinatorA,
    );
    const activationB = new VaultSessionActivationService(
      portsB.clock,
      portsB.ids,
      portsB.scheduledTasks,
      portsB.vaultLockTasks,
      sessionB,
      coordinatorB,
    );

    await expect(
      activationA.activate({
        activationAuthorization: generationA,
        unlockedVault: vaultA,
        sourceSnapshotVersionVector: { [values.deviceId]: 1 },
        lockAfterMs: 60_000,
      }),
    ).resolves.toEqual({ sessionId: "session-a", generation: 1 });
    await expect(
      activationB.activate({
        activationAuthorization: generationB,
        unlockedVault: vaultB,
        sourceSnapshotVersionVector: { [values.deviceId]: 1 },
        lockAfterMs: 60_000,
      }),
    ).rejects.toMatchObject({ name: "UnlockedVaultSessionExpiredError" });

    expect(portsB.vaultLockTasks.save).not.toHaveBeenCalled();
    await expect(sessionA.get()).resolves.toMatchObject({
      sessionId: "session-a",
      unlockedVault: { vaultId: values.vaultId },
    });
    expect(lockManager.requestedNames).toEqual([
      CLIPBOARD_OPERATION_LOCK_NAME,
      CLIPBOARD_OPERATION_LOCK_NAME,
      CLIPBOARD_OPERATION_LOCK_NAME,
      CLIPBOARD_OPERATION_LOCK_NAME,
      CLIPBOARD_OPERATION_LOCK_NAME,
    ]);
  });

  it("revokes an independently authorized activation when another context locks", async () => {
    const values = createCoreTestValues();
    const ports = createStrictSessionTestPorts(values);
    const lockManager = new SerializedWebLockManager();
    const activationCoordinator = new WebLocksClipboardOperationCoordinator(
      lockManager,
    );
    const cleanupCoordinator = new WebLocksClipboardOperationCoordinator(
      lockManager,
    );
    const { storageArea } = createChromeStorageArea();
    const activationMaterial = new ChromeUnlockedVaultSessionMaterialRepository(
      storageArea,
    );
    const cleanupMaterial = new ChromeUnlockedVaultSessionMaterialRepository(
      storageArea,
    );
    const activationSession = new UnlockedVaultSessionService(
      activationMaterial,
      ports.encryptedUnlockedVaultSessionPayloadRepository,
      ports.crypto,
      ports.ids,
      activationCoordinator,
    );
    const cleanupSession = new UnlockedVaultSessionService(
      cleanupMaterial,
      ports.encryptedUnlockedVaultSessionPayloadRepository,
      ports.crypto,
      ports.ids,
      cleanupCoordinator,
    );
    const activationAuthorization =
      await activationSession.requireVaultCanBeActivated(values.vaultId);
    const clipboardTasks = new ChromeClipboardClearTaskRepository(storageArea);
    const cleanup = new LockVaultUseCase(
      new VaultLifecycleCleanupService(
        new ClipboardClearService(
          {
            readText: vi.fn(async () => ""),
            writeText: vi.fn(async () => undefined),
          },
          clipboardTasks,
          ports.clock,
          new WebCryptoClipboardSecretHash(),
        ),
        clipboardTasks,
        cleanupCoordinator,
        ports.scheduledTasks,
        ports.vaultLockTasks,
        cleanupSession,
      ),
    );
    const activation = new VaultSessionActivationService(
      ports.clock,
      ports.ids,
      ports.scheduledTasks,
      ports.vaultLockTasks,
      activationSession,
      activationCoordinator,
    );
    const unlockedVault = createStrictUnlockedVaultWithEntries(values, []);

    await expect(cleanup.execute()).resolves.toBeUndefined();
    await expect(
      activation.activate({
        activationAuthorization,
        unlockedVault,
        sourceSnapshotVersionVector: { [values.deviceId]: 1 },
        lockAfterMs: 60_000,
      }),
    ).rejects.toMatchObject({ name: "UnlockedVaultSessionExpiredError" });

    expect(ports.vaultLockTasks.save).not.toHaveBeenCalled();
    expect(ports.scheduledTasks.scheduleTask).not.toHaveBeenCalled();
    await expect(
      activationMaterial.getPersistedUnlockedVaultSessionIdentity(),
    ).resolves.toBeNull();
    await expect(
      ports.encryptedUnlockedVaultSessionPayloadRepository.getEncryptedUnlockedVaultSessionPayload(),
    ).resolves.toBeNull();
    expect(lockManager.requestedNames).toEqual([
      CLIPBOARD_OPERATION_LOCK_NAME,
      CLIPBOARD_OPERATION_LOCK_NAME,
      CLIPBOARD_OPERATION_LOCK_NAME,
    ]);
  });

  it("locks a session activated after the cleanup context cached absence", async () => {
    const values = createCoreTestValues();
    const ports = createStrictSessionTestPorts(values);
    const lockManager = new SerializedWebLockManager();
    const activationCoordinator = new WebLocksClipboardOperationCoordinator(
      lockManager,
    );
    const cleanupCoordinator = new WebLocksClipboardOperationCoordinator(
      lockManager,
    );
    const { storageArea } = createChromeStorageArea();
    const activationMaterial = new ChromeUnlockedVaultSessionMaterialRepository(
      storageArea,
    );
    const cleanupMaterial = new ChromeUnlockedVaultSessionMaterialRepository(
      storageArea,
    );
    await cleanupMaterial.removeUnlockedVaultSessionMaterial();
    const activationSession = new UnlockedVaultSessionService(
      activationMaterial,
      ports.encryptedUnlockedVaultSessionPayloadRepository,
      ports.crypto,
      ports.ids,
      activationCoordinator,
    );
    const cleanupSession = new UnlockedVaultSessionService(
      cleanupMaterial,
      ports.encryptedUnlockedVaultSessionPayloadRepository,
      ports.crypto,
      ports.ids,
      cleanupCoordinator,
    );
    const unlockedVault = createStrictUnlockedVaultWithEntries(values, []);
    const activationAuthorization =
      await activationSession.requireVaultCanBeActivated(values.vaultId);
    vi.mocked(ports.ids.generateId)
      .mockReset()
      .mockResolvedValueOnce("lock-action")
      .mockResolvedValueOnce("active-session");
    const activation = new VaultSessionActivationService(
      ports.clock,
      ports.ids,
      ports.scheduledTasks,
      ports.vaultLockTasks,
      activationSession,
      activationCoordinator,
    );
    const clipboard: ClipboardPort = {
      readText: vi.fn(async () => ""),
      writeText: vi.fn(async () => undefined),
    };
    const clipboardTasks = new ChromeClipboardClearTaskRepository(storageArea);
    const cleanup = new LockVaultUseCase(
      new VaultLifecycleCleanupService(
        new ClipboardClearService(
          clipboard,
          clipboardTasks,
          ports.clock,
          new WebCryptoClipboardSecretHash(),
        ),
        clipboardTasks,
        cleanupCoordinator,
        ports.scheduledTasks,
        ports.vaultLockTasks,
        cleanupSession,
      ),
    );

    await expect(
      activation.activate({
        activationAuthorization,
        unlockedVault,
        sourceSnapshotVersionVector: { [values.deviceId]: 1 },
        lockAfterMs: 60_000,
      }),
    ).resolves.toEqual({ sessionId: "active-session", generation: 1 });
    await expect(
      cleanup.execute({ actionId: "lock-action" }),
    ).resolves.toBeUndefined();

    await expect(
      activationMaterial.getPersistedUnlockedVaultSessionIdentity(),
    ).resolves.toBeNull();
    await expect(
      ports.encryptedUnlockedVaultSessionPayloadRepository.getEncryptedUnlockedVaultSessionPayload(),
    ).resolves.toBeNull();
    await expect(ports.vaultLockTasks.get()).resolves.toBeNull();
    await expect(activationSession.get()).resolves.toBeNull();
    expect(Array.from(new Uint8Array(unlockedVault.vaultMasterKey))).toEqual(
      Array.from({ length: unlockedVault.vaultMasterKey.byteLength }, () => 0),
    );
    expect(lockManager.requestedNames).toEqual([
      CLIPBOARD_OPERATION_LOCK_NAME,
      CLIPBOARD_OPERATION_LOCK_NAME,
      CLIPBOARD_OPERATION_LOCK_NAME,
      CLIPBOARD_OPERATION_LOCK_NAME,
    ]);
  });

  it("wipes a cached session when persisted Chrome material is malformed", async () => {
    const values = createCoreTestValues();
    const ports = createStrictSessionTestPorts(values);
    const lockManager = new SerializedWebLockManager();
    const coordinator = new WebLocksClipboardOperationCoordinator(lockManager);
    const { getRecords, storageArea } = createChromeStorageArea();
    const material = new ChromeUnlockedVaultSessionMaterialRepository(
      storageArea,
    );
    const session = new UnlockedVaultSessionService(
      material,
      ports.encryptedUnlockedVaultSessionPayloadRepository,
      ports.crypto,
      ports.ids,
      coordinator,
    );
    const unlockedVault = createStrictUnlockedVaultWithEntries(values, []);
    const generation = await session.requireVaultCanBeActivated(values.vaultId);
    vi.mocked(ports.ids.generateId)
      .mockReset()
      .mockResolvedValueOnce("lock-action")
      .mockResolvedValueOnce("active-session");
    await new VaultSessionActivationService(
      ports.clock,
      ports.ids,
      ports.scheduledTasks,
      ports.vaultLockTasks,
      session,
      coordinator,
    ).activate({
      activationAuthorization: generation,
      unlockedVault,
      sourceSnapshotVersionVector: { [values.deviceId]: 1 },
      lockAfterMs: 60_000,
    });
    await storageArea.set({
      [UNLOCKED_VAULT_SESSION_MATERIAL_STORAGE_KEY]: {
        sessionId: 7,
      },
    });
    const clipboardTasks = new ChromeClipboardClearTaskRepository(storageArea);
    const lifecycle = new VaultLifecycleCleanupService(
      new ClipboardClearService(
        {
          readText: vi.fn(async () => ""),
          writeText: vi.fn(async () => undefined),
        },
        clipboardTasks,
        ports.clock,
        new WebCryptoClipboardSecretHash(),
      ),
      clipboardTasks,
      coordinator,
      ports.scheduledTasks,
      ports.vaultLockTasks,
      session,
    );

    await expect(lifecycle.cleanup()).rejects.toBeInstanceOf(Error);

    expect(
      getRecords()[UNLOCKED_VAULT_SESSION_MATERIAL_STORAGE_KEY],
    ).toBeUndefined();
    await expect(
      ports.encryptedUnlockedVaultSessionPayloadRepository.getEncryptedUnlockedVaultSessionPayload(),
    ).resolves.toBeNull();
    await expect(ports.vaultLockTasks.get()).resolves.toBeNull();
    expect(Array.from(new Uint8Array(unlockedVault.vaultMasterKey))).toEqual(
      Array.from({ length: unlockedVault.vaultMasterKey.byteLength }, () => 0),
    );
  });

  it("preserves a replacement session when stale-context discard acquires the lock", async () => {
    const valuesA = createCoreTestValues();
    const valuesB = createCoreTestValues();
    const portsA = createStrictSessionTestPorts(valuesA);
    const portsB = createStrictSessionTestPorts(valuesB);
    const lockManager = new SerializedWebLockManager();
    const coordinatorA = new WebLocksClipboardOperationCoordinator(lockManager);
    const coordinatorB = new WebLocksClipboardOperationCoordinator(lockManager);
    const { storageArea } = createChromeStorageArea();
    const materialA = new ChromeUnlockedVaultSessionMaterialRepository(
      storageArea,
    );
    const materialB = new ChromeUnlockedVaultSessionMaterialRepository(
      storageArea,
    );
    const sessionA = new UnlockedVaultSessionService(
      materialA,
      portsA.encryptedUnlockedVaultSessionPayloadRepository,
      portsA.crypto,
      portsA.ids,
      coordinatorA,
    );
    const sessionB = new UnlockedVaultSessionService(
      materialB,
      portsA.encryptedUnlockedVaultSessionPayloadRepository,
      portsB.crypto,
      portsB.ids,
      coordinatorB,
    );
    const vaultA = createStrictUnlockedVaultWithEntries(valuesA, []);
    const vaultB = createStrictUnlockedVaultWithEntries(valuesB, []);
    const generationA = await sessionA.requireVaultCanBeActivated(
      valuesA.vaultId,
    );
    vi.mocked(portsA.ids.generateId)
      .mockReset()
      .mockResolvedValueOnce("lock-action-a")
      .mockResolvedValueOnce("session-a");
    const activationA = new VaultSessionActivationService(
      portsA.clock,
      portsA.ids,
      portsA.scheduledTasks,
      portsA.vaultLockTasks,
      sessionA,
      coordinatorA,
    );
    const activeA = await activationA.activate({
      activationAuthorization: generationA,
      unlockedVault: vaultA,
      sourceSnapshotVersionVector: { [valuesA.deviceId]: 1 },
      lockAfterMs: 60_000,
    });
    const generationB = await sessionB.requireVaultCanBeActivated(
      valuesB.vaultId,
    );
    vi.mocked(portsB.ids.generateId)
      .mockReset()
      .mockResolvedValueOnce("lock-action-b")
      .mockResolvedValueOnce("session-b");
    const activationB = new VaultSessionActivationService(
      portsB.clock,
      portsB.ids,
      portsA.scheduledTasks,
      portsA.vaultLockTasks,
      sessionB,
      coordinatorB,
    );
    await activationB.activate({
      activationAuthorization: generationB,
      unlockedVault: vaultB,
      sourceSnapshotVersionVector: { [valuesB.deviceId]: 2 },
      lockAfterMs: 60_000,
    });
    const clipboardTasks = new ChromeClipboardClearTaskRepository(storageArea);
    const getClipboardTask = vi.spyOn(clipboardTasks, "get");
    const clipboard: ClipboardPort = {
      readText: vi.fn(async () => ""),
      writeText: vi.fn(async () => undefined),
    };
    const discard = vi.fn(async () => true);
    const lifecycle = new VaultLifecycleCleanupService(
      new ClipboardClearService(
        clipboard,
        clipboardTasks,
        portsA.clock,
        new WebCryptoClipboardSecretHash(),
      ),
      clipboardTasks,
      coordinatorA,
      portsA.scheduledTasks,
      portsA.vaultLockTasks,
      sessionA,
    );

    await expect(
      lifecycle.discardIfSessionIsActive(
        {
          sessionId: activeA.sessionId,
          vaultId: valuesA.vaultId,
          generation: activeA.generation,
          sourceSnapshotVersionVector: { [valuesA.deviceId]: 1 },
        },
        discard,
      ),
    ).resolves.toBe("session_replaced");

    expect(discard).not.toHaveBeenCalled();
    expect(getClipboardTask).not.toHaveBeenCalled();
    await expect(
      materialA.getPersistedUnlockedVaultSessionIdentity(),
    ).resolves.toMatchObject({ sessionId: "session-b" });
    await expect(portsA.vaultLockTasks.get()).resolves.toMatchObject({
      actionId: "lock-action-b",
    });
    expect(Array.from(new Uint8Array(vaultA.vaultMasterKey))).toEqual(
      Array.from({ length: vaultA.vaultMasterKey.byteLength }, () => 0),
    );
    expect(Array.from(new Uint8Array(vaultB.vaultMasterKey))).not.toEqual(
      Array.from({ length: vaultB.vaultMasterKey.byteLength }, () => 0),
    );
  });

  it("serializes a snapshot commit before independent same-session targeted cleanup", async () => {
    const values = createCoreTestValues();
    const ports = createStrictSessionTestPorts(values);
    const lockManager = new SerializedWebLockManager();
    const commitCoordinator = new WebLocksClipboardOperationCoordinator(
      lockManager,
    );
    const cleanupCoordinator = new WebLocksClipboardOperationCoordinator(
      lockManager,
    );
    const { storageArea } = createChromeStorageArea();
    const commitMaterial = new ChromeUnlockedVaultSessionMaterialRepository(
      storageArea,
    );
    const cleanupMaterial = new ChromeUnlockedVaultSessionMaterialRepository(
      storageArea,
    );
    const commitSession = new UnlockedVaultSessionService(
      commitMaterial,
      ports.encryptedUnlockedVaultSessionPayloadRepository,
      ports.crypto,
      ports.ids,
      commitCoordinator,
    );
    const cleanupSession = new UnlockedVaultSessionService(
      cleanupMaterial,
      ports.encryptedUnlockedVaultSessionPayloadRepository,
      ports.crypto,
      ports.ids,
      cleanupCoordinator,
    );
    const unlockedVault = createStrictUnlockedVaultWithEntries(values, []);
    const generation = await commitSession.requireVaultCanBeActivated(
      values.vaultId,
    );
    vi.mocked(ports.ids.generateId)
      .mockReset()
      .mockResolvedValueOnce("lock-action")
      .mockResolvedValueOnce("active-session");
    const activation = new VaultSessionActivationService(
      ports.clock,
      ports.ids,
      ports.scheduledTasks,
      ports.vaultLockTasks,
      commitSession,
      commitCoordinator,
    );
    const active = await activation.activate({
      activationAuthorization: generation,
      unlockedVault,
      sourceSnapshotVersionVector: { [values.deviceId]: 1 },
      lockAfterMs: 60_000,
    });
    await expect(cleanupSession.get()).resolves.toMatchObject({
      sessionId: active.sessionId,
      sourceSnapshotVersionVector: { [values.deviceId]: 1 },
    });
    const commitStarted = createDeferred();
    const releaseCommit = createDeferred();
    vi.mocked(
      ports.crypto.encryptUnlockedVaultSessionPayload,
    ).mockImplementationOnce(async () => {
      commitStarted.resolve();
      await releaseCommit.promise;
      return values.encryptedUnlockedVaultSessionPayload;
    });
    const committing = commitSession.commitPersistedSnapshot(
      active.sessionId,
      unlockedVault,
      { [values.deviceId]: 2 },
    );
    await commitStarted.promise;

    const clipboardTasks = new ChromeClipboardClearTaskRepository(storageArea);
    const clipboard: ClipboardPort = {
      readText: vi.fn(async () => ""),
      writeText: vi.fn(async () => undefined),
    };
    const cleanup = new VaultLifecycleCleanupService(
      new ClipboardClearService(
        clipboard,
        clipboardTasks,
        ports.clock,
        new WebCryptoClipboardSecretHash(),
      ),
      clipboardTasks,
      cleanupCoordinator,
      ports.scheduledTasks,
      ports.vaultLockTasks,
      cleanupSession,
    );
    const afterSessionRemoval = vi.fn(async () => undefined);
    const cleaning = cleanup.cleanup({
      requiredVaultId: values.vaultId,
      afterSessionRemoval,
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(ports.vaultLockTasks.get).not.toHaveBeenCalled();

    releaseCommit.resolve();
    await expect(committing).resolves.toBeUndefined();
    await expect(cleaning).resolves.toBe("cleaned");
    expect(afterSessionRemoval).toHaveBeenCalledTimes(1);
    await expect(
      commitMaterial.getPersistedUnlockedVaultSessionIdentity(),
    ).resolves.toBeNull();
    await expect(
      ports.encryptedUnlockedVaultSessionPayloadRepository.getEncryptedUnlockedVaultSessionPayload(),
    ).resolves.toBeNull();
    expect(lockManager.requestedNames).toEqual([
      CLIPBOARD_OPERATION_LOCK_NAME,
      CLIPBOARD_OPERATION_LOCK_NAME,
      CLIPBOARD_OPERATION_LOCK_NAME,
      CLIPBOARD_OPERATION_LOCK_NAME,
      CLIPBOARD_OPERATION_LOCK_NAME,
    ]);
  });

  it("serializes an independent session restore before a replacement commit", async () => {
    const values = createCoreTestValues();
    const ports = createStrictSessionTestPorts(values);
    const lockManager = new SerializedWebLockManager();
    const writerCoordinator = new WebLocksClipboardOperationCoordinator(
      lockManager,
    );
    const readerCoordinator = new WebLocksClipboardOperationCoordinator(
      lockManager,
    );
    const { storageArea } = createChromeStorageArea();
    const writerMaterial = new ChromeUnlockedVaultSessionMaterialRepository(
      storageArea,
    );
    const readerMaterial = new ChromeUnlockedVaultSessionMaterialRepository(
      storageArea,
    );
    const writer = new UnlockedVaultSessionService(
      writerMaterial,
      ports.encryptedUnlockedVaultSessionPayloadRepository,
      ports.crypto,
      ports.ids,
      writerCoordinator,
    );
    const reader = new UnlockedVaultSessionService(
      readerMaterial,
      ports.encryptedUnlockedVaultSessionPayloadRepository,
      ports.crypto,
      ports.ids,
      readerCoordinator,
    );
    const unlockedVault = createStrictUnlockedVaultWithEntries(values, []);
    const activationAuthorization = await writer.requireVaultCanBeActivated(
      values.vaultId,
    );
    vi.mocked(ports.ids.generateId).mockReset().mockResolvedValue("session-id");
    const sessionId = await writer.activate(
      activationAuthorization,
      unlockedVault,
      { [values.deviceId]: 1 },
    );
    const payloadReadStarted = createDeferred();
    const releasePayloadRead = createDeferred();
    vi.mocked(
      ports.encryptedUnlockedVaultSessionPayloadRepository
        .getEncryptedUnlockedVaultSessionPayload,
    ).mockImplementationOnce(async () => {
      payloadReadStarted.resolve();
      await releasePayloadRead.promise;
      return ports.saved.encryptedUnlockedVaultSessionPayload ?? null;
    });
    vi.mocked(ports.crypto.encryptUnlockedVaultSessionPayload).mockClear();

    const restoring = reader.get();
    await payloadReadStarted.promise;
    const committing = writer.commitPersistedSnapshot(
      sessionId,
      unlockedVault,
      { [values.deviceId]: 2 },
    );

    await Promise.resolve();
    await Promise.resolve();
    expect(
      ports.crypto.encryptUnlockedVaultSessionPayload,
    ).not.toHaveBeenCalled();

    releasePayloadRead.resolve();
    await expect(restoring).resolves.toMatchObject({ sessionId });
    await expect(committing).resolves.toBeUndefined();
    await expect(
      writerMaterial.getPersistedUnlockedVaultSessionIdentity(),
    ).resolves.toEqual({
      sessionId,
      vaultId: values.vaultId,
      sourceSnapshotVersionVector: { [values.deviceId]: 2 },
    });
  });

  it.each(["clear", "lock"] as const)(
    "serializes a real copy against an independent %s workflow",
    async (competingOperation) => {
      const values = createCoreTestValues();
      const ports = createCoreTestPorts(values);
      saveUnlockedVaultWithEntries(ports, values, [singlePasswordEntry]);
      vi.mocked(ports.ids.generateId).mockReset();
      vi.mocked(ports.ids.generateId).mockResolvedValue("clipboard-action-id");

      const lockManager = new SerializedWebLockManager();
      const copyCoordinator = new WebLocksClipboardOperationCoordinator(
        lockManager,
      );
      const clearCoordinator = new WebLocksClipboardOperationCoordinator(
        lockManager,
      );
      const lockCoordinator = new WebLocksClipboardOperationCoordinator(
        lockManager,
      );
      const copySession = new UnlockedVaultSessionService(
        ports.unlockedVaultSessionMaterialRepository,
        ports.encryptedUnlockedVaultSessionPayloadRepository,
        ports.crypto,
        ports.ids,
        copyCoordinator,
      );
      const lockSession = new UnlockedVaultSessionService(
        ports.unlockedVaultSessionMaterialRepository,
        ports.encryptedUnlockedVaultSessionPayloadRepository,
        ports.crypto,
        ports.ids,
        lockCoordinator,
      );
      const { storageArea } = createChromeStorageArea();
      const repository = new ChromeClipboardClearTaskRepository(storageArea);
      const copyWriteStarted = createDeferred();
      const releaseCopyWrite = createDeferred();
      let clipboardValue = "";
      const clipboard: ClipboardPort = {
        readText: vi.fn(async () => clipboardValue),
        writeText: vi.fn(async (value) => {
          if (value !== "") {
            copyWriteStarted.resolve();
            await releaseCopyWrite.promise;
          }

          clipboardValue = value;
        }),
      };
      const clock = { now: vi.fn(() => 1_000) };
      const secretHash = new WebCryptoClipboardSecretHash();
      const clipboardClear = new ClipboardClearService(
        clipboard,
        repository,
        clock,
        secretHash,
      );
      const copy = new CopyEntryPasswordUseCase(
        clipboard,
        clipboardClear,
        copyCoordinator,
        secretHash,
        ports.ids,
        repository,
        ports.scheduledTasks,
        clock,
        copySession,
      );
      const clear = new ClearClipboardTaskUseCase(
        clipboardClear,
        clearCoordinator,
      );
      const lock = new LockVaultUseCase(
        new VaultLifecycleCleanupService(
          clipboardClear,
          repository,
          lockCoordinator,
          ports.scheduledTasks,
          ports.vaultLockTasks,
          lockSession,
        ),
      );

      const copying = copy.execute({
        vaultId: values.vaultId,
        entryId: singlePasswordEntry.id,
        clearAfterMs: 60_000,
      });
      await copyWriteStarted.promise;
      const competing =
        competingOperation === "clear"
          ? clear.execute({
              actionId: "clipboard-action-id",
              requireExpired: false,
            })
          : lock.execute();

      expect(clipboard.readText).not.toHaveBeenCalled();
      expect(ports.saved.unlockedVaultSession).toBeDefined();

      releaseCopyWrite.resolve();
      await expect(copying).resolves.toEqual({ copied: true });

      if (competingOperation === "clear") {
        await expect(competing).resolves.toEqual({ cleared: true });
        expect(ports.saved.unlockedVaultSession).toBeDefined();
      } else {
        await expect(competing).resolves.toBeUndefined();
        expect(ports.saved.unlockedVaultSession).toBeUndefined();
        expect(ports.scheduledTasks.cancelTask).toHaveBeenCalledWith({
          name: "clearClipboard",
          actionId: "clipboard-action-id",
        });
      }

      expect(clipboardValue).toBe("");
      await expect(repository.get()).resolves.toBeNull();
      expect(lockManager.requestedNames).toEqual([
        CLIPBOARD_OPERATION_LOCK_NAME,
        CLIPBOARD_OPERATION_LOCK_NAME,
      ]);
    },
  );
});
