import { vi } from "vitest";
import { CURRENT_ALGORITHM_SUITE } from "../../domain/crypto/algorithm-suite.const";
import type { RandomBytes } from "../../domain/crypto/brand-keys";
import type { DeviceSignKeyPair } from "../../domain/device-trust/brand-keys";
import type { DeviceAccessMaterial } from "../../domain/device-trust/device-access-material";
import type { VaultSnapshot } from "../../domain/snapshot/vault-snapshot";
import type { LocalVaultDescriptor } from "../../domain/vault/local-vault-descriptor";
import type { UnlockedVault } from "../../domain/session/unlocked-vault";
import type { UnlockedVaultSessionPayloadKey } from "../../domain/session/unlocked-vault-session-payload-key";
import type { Vault } from "../../domain/vault/vault";
import type { Bip39Port } from "../../ports/crypto/bip39.port";
import type { ClockPort } from "../../ports/system/clock.port";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { EncryptedUnlockedVaultSessionPayloadRepositoryPort } from "../../ports/session/encrypted-unlocked-vault-session-payload-repository.port";
import type { IdPort } from "../../ports/system/id.port";
import type { ScheduledTaskPort } from "../../ports/system/scheduled-task.port";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import type { VaultDisplayNamePort } from "../../ports/vault/vault-display-name.port";
import type { VaultLockTaskRepositoryPort } from "../../ports/vault/vault-lock-task-repository.port";
import type { UnlockedVaultSessionMaterialRepositoryPort } from "../../ports/session/unlocked-vault-session-material-repository.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import { createCoreTestValues, type CoreTestValues } from "./values";
import type { SerializedEncrypted } from "../../domain";

export type SavedCoreRecords = {
  localVaultDescriptor?: LocalVaultDescriptor;
  deviceAccessMaterial?: DeviceAccessMaterial;
  vaultSnapshot?: VaultSnapshot;
  unlockedVaultSession?: {
    readonly unlockedVault: UnlockedVault;
    readonly sourceSnapshotRevision: number;
  };
  unlockedVaultSessionMaterial?: {
    readonly sessionId: string;
    readonly vaultId: string;
    readonly sourceSnapshotRevision: number;
    readonly deviceId: string;
    readonly vaultMasterKey: UnlockedVault["vaultMasterKey"];
    readonly devicePrivateSignKey: UnlockedVault["devicePrivateSignKey"];
    readonly payloadKey: UnlockedVaultSessionPayloadKey;
  };
  encryptedUnlockedVaultSessionPayload?: {
    readonly sessionId: string;
    readonly vaultId: string;
    readonly sourceSnapshotRevision: number;
    readonly content: SerializedEncrypted<{
      readonly vault: Vault;
    }>;
  };
  unlockedVaultSessionPayload?: {
    readonly vault: Vault;
  };
};

export type CoreTestPorts = ReturnType<typeof createCoreTestPorts>;

export function createCoreTestPorts(
  values: CoreTestValues = createCoreTestValues(),
) {
  const saved: SavedCoreRecords = {};
  let unlockedVaultSessionMirror:
    | {
        readonly unlockedVault: UnlockedVault;
        readonly sourceSnapshotRevision: number;
      }
    | undefined;

  function writeSplitUnlockedVaultSessionRecords(session: {
    readonly unlockedVault: UnlockedVault;
    readonly sourceSnapshotRevision: number;
  }): void {
    const context = {
      sessionId: values.sessionId,
      vaultId: session.unlockedVault.vaultId,
      sourceSnapshotRevision: session.sourceSnapshotRevision,
    };

    saved.unlockedVaultSessionMaterial = {
      ...context,
      deviceId: session.unlockedVault.deviceId,
      vaultMasterKey: session.unlockedVault.vaultMasterKey,
      devicePrivateSignKey: session.unlockedVault.devicePrivateSignKey,
      payloadKey: values.unlockedVaultSessionPayloadKey,
    };
    saved.encryptedUnlockedVaultSessionPayload = {
      ...context,
      content: values.encryptedUnlockedVaultSessionPayload,
    };
    saved.unlockedVaultSessionPayload = {
      vault: session.unlockedVault.vault,
    };
  }

  function clearSplitUnlockedVaultSessionRecords(): void {
    saved.unlockedVaultSessionMaterial = undefined;
    saved.encryptedUnlockedVaultSessionPayload = undefined;
    saved.unlockedVaultSessionPayload = undefined;
  }

  Object.defineProperty(saved, "unlockedVaultSession", {
    get: () => unlockedVaultSessionMirror,
    set: (
      session:
        | {
            readonly unlockedVault: UnlockedVault;
            readonly sourceSnapshotRevision: number;
          }
        | undefined,
    ) => {
      unlockedVaultSessionMirror = session;

      if (session === undefined) {
        clearSplitUnlockedVaultSessionRecords();
        return;
      }

      writeSplitUnlockedVaultSessionRecords(session);
    },
  });

  const deviceSignKeyPair: DeviceSignKeyPair = {
    publicKey: values.devicePublicSignKey,
    privateKey: values.devicePrivateSignKey,
  };

  const crypto: CryptoPort = {
    algorithmSuite: CURRENT_ALGORITHM_SUITE,
    generateRandomBytes: vi.fn(
      async (byteLength: number) => new ArrayBuffer(byteLength) as RandomBytes,
    ),
    hashSecretValue: vi.fn(async (value) => `hash:${value}`),
    compareSecretValueHash: vi.fn(async (left, right) => left === right),
    generateDeviceSignKeyPair: vi.fn(async () => deviceSignKeyPair),
    generateVaultMasterKey: vi.fn(async () => values.vaultMasterKey),
    generateDeviceSlotKey: vi.fn(async () => values.deviceSlotKey),
    generateDeviceEnrollmentSecret: vi.fn(
      async () => values.deviceEnrollmentSecret,
    ),
    generateRecoveryKey: vi.fn(async () => values.recoverySecretKey),
    generateUnlockedVaultSessionPayloadKey: vi.fn(
      async () => values.unlockedVaultSessionPayloadKey,
    ),
    generateMasterPasswordSalt: vi
      .fn()
      .mockResolvedValueOnce(values.masterPasswordSalt)
      .mockResolvedValue(values.newMasterPasswordSalt),
    generateLocalKeysProtectionSalt: vi
      .fn()
      .mockResolvedValueOnce(values.localKeysProtectionSalt)
      .mockResolvedValue(values.newLocalKeysProtectionSalt),
    deriveLocalRootKey: vi
      .fn()
      .mockResolvedValueOnce(values.localRootKey)
      .mockResolvedValue(values.newLocalRootKey),
    deriveLocalKeysProtectionKey: vi.fn(async (_localRootKey, salt) =>
      salt === values.newLocalKeysProtectionSalt
        ? values.newLocalKeysProtectionKey
        : values.localKeysProtectionKey,
    ),
    deriveDeviceSlotVaultMasterKeyProtectionKey: vi.fn(
      async () => values.deviceSlotVaultMasterKeyProtectionKey,
    ),
    deriveRecoveryVaultMasterKeyProtectionKey: vi.fn(
      async () => values.recoveryVaultMasterKeyProtectionKey,
    ),
    deriveEnrollmentVaultMasterKeyProtectionKey: vi.fn(
      async () => values.enrollmentVaultMasterKeyProtectionKey,
    ),
    wrapLocalKeysPayload: vi.fn(async (_localKeysPayload, protectionKey) =>
      protectionKey === values.newLocalKeysProtectionKey
        ? values.reprotectedLocalKeys
        : values.protectedLocalKeys,
    ),
    unwrapLocalKeysPayload: vi.fn(async () => ({
      deviceSlotKey: values.deviceSlotKey,
      devicePrivateSignKey: values.devicePrivateSignKey,
    })),
    wrapVaultMasterKey: vi.fn(async (_vaultMasterKey, protectionKey) => {
      if (protectionKey === values.recoveryVaultMasterKeyProtectionKey) {
        return values.protectedRecoveryVaultMasterKey;
      }

      if (protectionKey === values.enrollmentVaultMasterKeyProtectionKey) {
        return values.protectedEnrollmentVaultMasterKey;
      }

      return values.protectedDeviceVaultMasterKey;
    }),
    unwrapVaultMasterKey: vi.fn(async () => values.vaultMasterKey),
    encryptVaultSnapshotContent: vi.fn(async () => values.encryptedVault),
    decryptVaultSnapshotContent: vi.fn(async () => values.decryptedVault),
    encryptUnlockedVaultSessionPayload: vi.fn(async (payload) => {
      saved.unlockedVaultSessionPayload = payload;

      return values.encryptedUnlockedVaultSessionPayload;
    }),
    decryptUnlockedVaultSessionPayload: vi.fn(
      async () =>
        saved.unlockedVaultSessionPayload ?? {
          vault: values.decryptedVault,
        },
    ),
    signVaultSnapshot: vi.fn(async () => values.snapshotSignature),
    verifyVaultSnapshotSignature: vi.fn(async () => true),
  };

  const bip39: Bip39Port = {
    recoveryKeyToMnemonic: vi.fn(async () => values.recoveryMnemonicKey),
    mnemonicToRecoveryKey: vi.fn(async () => values.recoverySecretKey),
  };

  const vaultLocalRepository: VaultLocalRepositoryPort = {
    saveInitializedLocalVault: vi.fn(
      async (descriptor, deviceAccessMaterial, snapshot) => {
        saved.localVaultDescriptor = descriptor;
        saved.deviceAccessMaterial = deviceAccessMaterial;
        saved.vaultSnapshot = snapshot;
      },
    ),
    saveRecoveredLocalVault: vi.fn(async (deviceAccessMaterial, snapshot) => {
      saved.deviceAccessMaterial = deviceAccessMaterial;
      saved.vaultSnapshot = snapshot;
    }),
    removePersistedLocalVault: vi.fn(async () => {
      saved.localVaultDescriptor = undefined;
      saved.deviceAccessMaterial = undefined;
      saved.vaultSnapshot = undefined;
    }),
    saveLocalVaultDescriptor: vi.fn(async (descriptor) => {
      saved.localVaultDescriptor = descriptor;
    }),
    getLocalVaultDescriptor: vi.fn(),
    listLocalVaultDescriptors: vi.fn(),
    removeLocalVaultDescriptor: vi.fn(),
    saveDeviceAccessMaterial: vi.fn(async (deviceAccessMaterial) => {
      saved.deviceAccessMaterial = deviceAccessMaterial;
    }),
    getDeviceAccessMaterial: vi.fn(async (vaultId) => {
      const deviceAccessMaterial = saved.deviceAccessMaterial;

      if (deviceAccessMaterial === undefined) {
        return null;
      }

      return deviceAccessMaterial.vaultId === vaultId
        ? deviceAccessMaterial
        : null;
    }),
    removeDeviceAccessMaterial: vi.fn(async () => {
      saved.deviceAccessMaterial = undefined;
    }),
    saveVaultSnapshot: vi.fn(async (vaultSnapshot) => {
      saved.vaultSnapshot = vaultSnapshot;
    }),
    getVaultSnapshot: vi.fn(async (vaultId) => {
      const vaultSnapshot = saved.vaultSnapshot;

      if (vaultSnapshot === undefined) {
        return null;
      }

      return vaultSnapshot.metadata.id === vaultId ? vaultSnapshot : null;
    }),
    removeVaultSnapshot: vi.fn(),
  };

  const unlockedVaultSessionMaterialRepository: UnlockedVaultSessionMaterialRepositoryPort =
    {
      saveUnlockedVaultSessionMaterial: vi.fn(async (material) => {
        saved.unlockedVaultSessionMaterial = material;
      }),
      getUnlockedVaultSessionMaterial: vi.fn(
        async () => saved.unlockedVaultSessionMaterial ?? null,
      ),
      removeUnlockedVaultSessionMaterial: vi.fn(async () => {
        saved.unlockedVaultSessionMaterial = undefined;
      }),
    };

  const encryptedUnlockedVaultSessionPayloadRepository: EncryptedUnlockedVaultSessionPayloadRepositoryPort =
    {
      saveEncryptedUnlockedVaultSessionPayload: vi.fn(
        async (encryptedPayload) => {
          saved.encryptedUnlockedVaultSessionPayload = encryptedPayload;
        },
      ),
      getEncryptedUnlockedVaultSessionPayload: vi.fn(
        async () => saved.encryptedUnlockedVaultSessionPayload ?? null,
      ),
      removeEncryptedUnlockedVaultSessionPayload: vi.fn(async () => {
        saved.encryptedUnlockedVaultSessionPayload = undefined;
        saved.unlockedVaultSessionPayload = undefined;
      }),
    };

  const ids: IdPort = {
    generateId: vi
      .fn()
      .mockResolvedValueOnce(values.vaultId)
      .mockResolvedValueOnce(values.deviceId)
      .mockResolvedValue(values.sessionId),
  };

  const unlockedVaultSession = new UnlockedVaultSessionService(
    unlockedVaultSessionMaterialRepository,
    encryptedUnlockedVaultSessionPayloadRepository,
    crypto,
    ids,
  );
  const sessionServices = {
    unlockedVaultSession,
  };

  const commitSessionOriginal =
    sessionServices.unlockedVaultSession.commit.bind(
      sessionServices.unlockedVaultSession,
    );
  const getSessionOriginal = sessionServices.unlockedVaultSession.get.bind(
    sessionServices.unlockedVaultSession,
  );
  const removeSessionOriginal =
    sessionServices.unlockedVaultSession.remove.bind(
      sessionServices.unlockedVaultSession,
    );

  vi.spyOn(sessionServices.unlockedVaultSession, "commit").mockImplementation(
    async (unlockedVault, sourceSnapshotRevision) => {
      await commitSessionOriginal(unlockedVault, sourceSnapshotRevision);
      unlockedVaultSessionMirror = {
        unlockedVault,
        sourceSnapshotRevision,
      };
    },
  );
  vi.spyOn(sessionServices.unlockedVaultSession, "get").mockImplementation(
    async () => {
      const session = await getSessionOriginal();
      unlockedVaultSessionMirror = session ?? undefined;

      return session;
    },
  );
  vi.spyOn(sessionServices.unlockedVaultSession, "remove").mockImplementation(
    async () => {
      await removeSessionOriginal();
      unlockedVaultSessionMirror = undefined;
    },
  );

  const clock: ClockPort = {
    now: vi.fn(() => values.timestamp),
  };

  const scheduledTasks: ScheduledTaskPort = {
    scheduleTask: vi.fn(async () => undefined),
    cancelTask: vi.fn(async () => undefined),
  };

  const syncProvider: SyncProviderPort = {
    setup: vi.fn(async () => values.syncConfig),
    getLatestVaultSnapshotDescriptor: vi.fn(async () => null),
    downloadVaultSnapshot: vi.fn(),
    uploadVaultSnapshot: vi.fn(async () => undefined),
    removeVaultSnapshots: vi.fn(async () => undefined),
  };

  const vaultLockTasks: VaultLockTaskRepositoryPort = {
    save: vi.fn(async () => undefined),
    get: vi.fn(async () => null),
    remove: vi.fn(async () => undefined),
  };

  const vaultDisplayName: VaultDisplayNamePort = {
    generateVaultDisplayName: vi.fn(async () => values.vaultDisplayName),
  };

  return {
    crypto,
    bip39,
    vaultLocalRepository,
    unlockedVaultSessionMaterialRepository,
    encryptedUnlockedVaultSessionPayloadRepository,
    ids,
    clock,
    scheduledTasks,
    syncProvider,
    vaultLockTasks,
    vaultDisplayName,
    sessionServices,
    saved,
  };
}
