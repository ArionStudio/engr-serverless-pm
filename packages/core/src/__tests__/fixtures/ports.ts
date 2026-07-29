import { vi } from "vitest";
import { CURRENT_ALGORITHM_SUITE } from "../../domain/crypto/algorithm-suite.const";
import type { RandomBytes } from "../../domain/crypto/brand-keys";
import type { DeviceSignKeyPair } from "../../domain/device-trust/brand-keys";
import type { DeviceAccessMaterial } from "../../domain/device-trust/device-access-material";
import type { DeviceAccessRecoveryBackup } from "../../domain/device-trust/device-access-recovery-backup";
import type { VaultSnapshot } from "../../domain/snapshot/vault-snapshot";
import type { LocalVaultDescriptor } from "../../domain/vault/local-vault-descriptor";
import type {
  EncryptedUnlockedVaultSessionPayload,
  UnlockedVaultSession,
  UnlockedVaultSessionMaterial,
} from "../../domain/session/unlocked-vault-session.type";
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
import type { LocalVaultTrustCheckpoint } from "../../domain/device-trust";
import { LocalVaultSnapshotChangedError } from "../../errors/vault-snapshot.errors";

export type SavedCoreRecords = {
  localVaultDescriptor?: LocalVaultDescriptor;
  deviceAccessMaterial?: DeviceAccessMaterial;
  deviceAccessRecoveryBackup?: DeviceAccessRecoveryBackup;
  vaultSnapshot?: VaultSnapshot;
  vaultSnapshotDigest?: string;
  localVaultTrustCheckpoint?: LocalVaultTrustCheckpoint;
  unlockedVaultSession?: UnlockedVaultSession;
  unlockedVaultSessionMaterial?: UnlockedVaultSessionMaterial;
  encryptedUnlockedVaultSessionPayload?: EncryptedUnlockedVaultSessionPayload;
  unlockedVaultSessionPayload?: {
    readonly vault: Vault;
  };
};

export type CoreTestPorts = ReturnType<typeof createCoreTestPorts>;

export function createCoreTestPorts(
  values: CoreTestValues = createCoreTestValues(),
) {
  const saved: SavedCoreRecords = {
    vaultSnapshotDigest: values.vaultSnapshotDigest,
  };
  let unlockedVaultSessionMirror: UnlockedVaultSession | undefined;

  function writeSplitUnlockedVaultSessionRecords(
    session: UnlockedVaultSession,
  ): void {
    const context = {
      sessionId: session.sessionId,
      vaultId: session.unlockedVault.vaultId,
      sourceSnapshotVersionVector: session.sourceSnapshotVersionVector,
    };

    saved.unlockedVaultSessionMaterial = {
      ...context,
      deviceId: session.unlockedVault.deviceId,
      vaultMasterKey: session.unlockedVault.vaultMasterKey,
      devicePrivateSignKey: session.unlockedVault.devicePrivateSignKey,
      trustedSnapshotContext: session.unlockedVault.trustedSnapshotContext,
      vaultTrustAnchor: session.unlockedVault.vaultTrustAnchor,
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
    set: (session: UnlockedVaultSession | undefined) => {
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
    generateRecoveryLocalKeysProtectionSalt: vi.fn(
      async () => values.recoveryLocalKeysProtectionSalt,
    ),
    deriveLocalRootKey: vi
      .fn()
      .mockResolvedValueOnce(values.localRootKey)
      .mockResolvedValue(values.newLocalRootKey),
    deriveLocalKeysProtectionKey: vi.fn(async (_localRootKey, salt) =>
      salt === values.newLocalKeysProtectionSalt
        ? values.newLocalKeysProtectionKey
        : values.localKeysProtectionKey,
    ),
    deriveRecoveryLocalKeysProtectionKey: vi.fn(async (_recoveryKey, salt) =>
      salt === values.rotatedRecoveryLocalKeysProtectionSalt
        ? values.rotatedRecoveryLocalKeysProtectionKey
        : values.recoveryLocalKeysProtectionKey,
    ),
    deriveDeviceSlotVaultMasterKeyProtectionKey: vi.fn(
      async () => values.deviceSlotVaultMasterKeyProtectionKey,
    ),
    deriveEnrollmentVaultMasterKeyProtectionKey: vi.fn(
      async () => values.enrollmentVaultMasterKeyProtectionKey,
    ),
    wrapLocalKeysPayload: vi.fn(async (_localKeysPayload, protectionKey) => {
      if (protectionKey === values.newLocalKeysProtectionKey) {
        return values.reprotectedLocalKeys;
      }

      if (protectionKey === values.recoveryLocalKeysProtectionKey) {
        return values.recoveryProtectedLocalKeys;
      }

      if (protectionKey === values.rotatedRecoveryLocalKeysProtectionKey) {
        return values.rotatedRecoveryProtectedLocalKeys;
      }

      return values.protectedLocalKeys;
    }),
    unwrapLocalKeysPayload: vi.fn(async () => ({
      deviceSlotKey: values.deviceSlotKey,
      devicePrivateSignKey: values.devicePrivateSignKey,
      vaultTrustAnchor: values.vaultTrustAnchor,
    })),
    wrapVaultMasterKey: vi.fn(async (_vaultMasterKey, protectionKey) => {
      if (protectionKey === values.enrollmentVaultMasterKeyProtectionKey) {
        return values.protectedEnrollmentVaultMasterKey;
      }

      return values.protectedDeviceVaultMasterKey;
    }),
    unwrapVaultMasterKey: vi.fn(async () => values.vaultMasterKey),
    digestProtectedVaultMasterKey: vi.fn(
      async () => values.protectedEnrollmentVaultMasterKeyDigest,
    ),
    digestDevicePublicSignKey: vi.fn(async (publicKey) =>
      publicKey === values.pendingDevicePublicSignKey
        ? values.pendingDevicePublicSignKeyDigest
        : values.devicePublicSignKeyDigest,
    ),
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
    verifyDeviceSignKeyPair: vi.fn(async () => true),
    digestVaultTrustCertificate: vi.fn(
      async () => values.vaultTrustCertificateDigest,
    ),
    signVaultTrustCertificate: vi.fn(
      async () => values.vaultTrustCertificateSignature,
    ),
    verifyVaultTrustCertificateSignature: vi.fn(async () => true),
    digestVaultSnapshot: vi.fn(async () => values.vaultSnapshotDigest),
    signLocalVaultTrustCheckpoint: vi.fn(
      async () => values.localVaultTrustCheckpoint.signature,
    ),
    verifyLocalVaultTrustCheckpointSignature: vi.fn(async () => true),
    signDeviceEnrollmentAuthorization: vi.fn(
      async () => values.deviceEnrollmentAuthorizationSignature,
    ),
    verifyDeviceEnrollmentAuthorizationSignature: vi.fn(async () => true),
  };

  const bip39: Bip39Port = {
    recoveryKeyToMnemonic: vi.fn(async (recoveryKey) =>
      recoveryKey === values.rotatedRecoverySecretKey
        ? values.rotatedRecoveryMnemonicKey
        : values.recoveryMnemonicKey,
    ),
    mnemonicToRecoveryKey: vi.fn(async (recoveryMnemonicKey) =>
      recoveryMnemonicKey === values.rotatedRecoveryMnemonicKey
        ? values.rotatedRecoverySecretKey
        : values.recoverySecretKey,
    ),
  };

  const vaultLocalRepository: VaultLocalRepositoryPort = {
    saveInitializedLocalVault: vi.fn(
      async ({
        descriptor,
        deviceAccessMaterial,
        deviceAccessRecoveryBackup,
        snapshot,
        checkpoint,
      }) => {
        saved.localVaultDescriptor = descriptor;
        saved.deviceAccessMaterial = deviceAccessMaterial;
        saved.deviceAccessRecoveryBackup = deviceAccessRecoveryBackup;
        saved.vaultSnapshot = snapshot;
        saved.vaultSnapshotDigest = checkpoint.payload.snapshotDigest;
        saved.localVaultTrustCheckpoint = checkpoint;
      },
    ),
    removePersistedLocalVault: vi.fn(async () => {
      saved.localVaultDescriptor = undefined;
      saved.deviceAccessMaterial = undefined;
      saved.deviceAccessRecoveryBackup = undefined;
      saved.vaultSnapshot = undefined;
      saved.vaultSnapshotDigest = undefined;
      saved.localVaultTrustCheckpoint = undefined;
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
    saveRecoveredDeviceAccess: vi.fn(
      async (deviceAccessMaterial, deviceAccessRecoveryBackup) => {
        saved.deviceAccessMaterial = deviceAccessMaterial;
        saved.deviceAccessRecoveryBackup = deviceAccessRecoveryBackup;
      },
    ),
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
    saveDeviceAccessRecoveryBackup: vi.fn(
      async (deviceAccessRecoveryBackup) => {
        saved.deviceAccessRecoveryBackup = deviceAccessRecoveryBackup;
      },
    ),
    getDeviceAccessRecoveryBackup: vi.fn(async (vaultId) => {
      const deviceAccessRecoveryBackup = saved.deviceAccessRecoveryBackup;

      if (deviceAccessRecoveryBackup === undefined) {
        return null;
      }

      return deviceAccessRecoveryBackup.vaultId === vaultId
        ? deviceAccessRecoveryBackup
        : null;
    }),
    removeDeviceAccessRecoveryBackup: vi.fn(async () => {
      saved.deviceAccessRecoveryBackup = undefined;
    }),
    getVaultSnapshot: vi.fn(async (vaultId) => {
      const vaultSnapshot = saved.vaultSnapshot;

      if (vaultSnapshot === undefined) {
        return null;
      }

      return vaultSnapshot.metadata.id === vaultId ? vaultSnapshot : null;
    }),
    removeVaultSnapshot: vi.fn(),
    saveVaultSnapshotWithCheckpoint: vi.fn(
      async ({ expectedSnapshotDigest, snapshot, checkpoint }) => {
        const currentSnapshot = saved.vaultSnapshot;

        if (
          currentSnapshot === undefined ||
          currentSnapshot.metadata.id !== snapshot.metadata.id ||
          saved.vaultSnapshotDigest !== expectedSnapshotDigest
        ) {
          throw new LocalVaultSnapshotChangedError(snapshot.metadata.id);
        }

        saved.vaultSnapshot = snapshot;
        saved.vaultSnapshotDigest = checkpoint.payload.snapshotDigest;
        saved.localVaultTrustCheckpoint = checkpoint;
      },
    ),
    getLocalVaultTrustCheckpoint: vi.fn(async (vaultId) => {
      const checkpoint = saved.localVaultTrustCheckpoint;

      return checkpoint !== undefined && checkpoint.payload.vaultId === vaultId
        ? checkpoint
        : null;
    }),
    removeLocalVaultTrustCheckpoint: vi.fn(async () => {
      saved.localVaultTrustCheckpoint = undefined;
    }),
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
        unlockedVaultSessionMirror = undefined;
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

  const activateSessionOriginal =
    sessionServices.unlockedVaultSession.activate.bind(
      sessionServices.unlockedVaultSession,
    );
  const getSessionOriginal = sessionServices.unlockedVaultSession.get.bind(
    sessionServices.unlockedVaultSession,
  );
  const commitPersistedSnapshotOriginal =
    sessionServices.unlockedVaultSession.commitPersistedSnapshot.bind(
      sessionServices.unlockedVaultSession,
    );
  const removeSessionOriginal =
    sessionServices.unlockedVaultSession.remove.bind(
      sessionServices.unlockedVaultSession,
    );

  vi.spyOn(sessionServices.unlockedVaultSession, "activate").mockImplementation(
    async (
      activationGeneration,
      unlockedVault,
      sourceSnapshotVersionVector,
    ) => {
      const sessionId = await activateSessionOriginal(
        activationGeneration,
        unlockedVault,
        sourceSnapshotVersionVector,
      );
      unlockedVaultSessionMirror = {
        sessionId,
        unlockedVault,
        sourceSnapshotVersionVector,
      };

      return sessionId;
    },
  );
  vi.spyOn(
    sessionServices.unlockedVaultSession,
    "commitPersistedSnapshot",
  ).mockImplementation(
    async (sessionId, unlockedVault, sourceSnapshotVersionVector) => {
      await commitPersistedSnapshotOriginal(
        sessionId,
        unlockedVault,
        sourceSnapshotVersionVector,
      );
      unlockedVaultSessionMirror = {
        sessionId,
        unlockedVault,
        sourceSnapshotVersionVector,
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
