import { vi } from "vitest";
import { CURRENT_ALGORITHM_SUITE } from "../../domain/crypto/algorithm-suite.const";
import type { RandomBytes } from "../../domain/crypto/brand-keys";
import type {
  DeviceSignKeyPair,
  DeviceVaultKeyPair,
} from "../../domain/device-trust/brand-keys";
import type { DeviceAccessMaterial } from "../../domain/device-trust/device-access-material";
import type { DeviceAccessRecoveryBackup } from "../../domain/device-trust/device-access-recovery-backup";
import {
  getNextDeviceAccessRevision,
  INITIAL_DEVICE_ACCESS_REVISION,
} from "../../domain/device-trust/device-access-revision";
import {
  areDeviceAccessRecordsConsistent,
  haveSameDeviceAccessIdentity,
  isValidDeviceAccessRecordIdentity,
  isValidLocalAccessGenerationId,
} from "../../domain/device-trust/device-access-records";
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
import type {
  ClipboardOperationCoordinatorPort,
  ClipboardOperationLease,
} from "../../ports/clipboard/clipboard-operation-coordinator.port";
import type { ClipboardSecretHashPort } from "../../ports/clipboard/clipboard-secret-hash.port";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { EncryptedUnlockedVaultSessionPayloadRepositoryPort } from "../../ports/session/encrypted-unlocked-vault-session-payload-repository.port";
import type { IdPort } from "../../ports/system/id.port";
import type { ScheduledTaskPort } from "../../ports/system/scheduled-task.port";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import type { VaultDisplayNamePort } from "../../ports/vault/vault-display-name.port";
import type {
  VaultLockTask,
  VaultLockTaskRepositoryPort,
} from "../../ports/vault/vault-lock-task-repository.port";
import type { UnlockedVaultSessionMaterialRepositoryPort } from "../../ports/session/unlocked-vault-session-material-repository.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import { createCoreTestValues, type CoreTestValues } from "./values";
import type { LocalVaultTrustCheckpoint } from "../../domain/device-trust";
import type { EncryptedDeviceSyncCredentialState } from "../../domain/sync";
import type { PendingDeviceEnrollment } from "../../domain/device-trust";
import { LocalVaultSnapshotChangedError } from "../../errors/vault-snapshot.errors";
import { LocalVaultAlreadyInitializedError } from "../../errors/vault-lifecycle.errors";
import { DeviceAccessMaterialChangedError } from "../../errors/vault-device.errors";

export type SavedCoreRecords = {
  localVaultDescriptor?: LocalVaultDescriptor;
  deviceAccessMaterial?: DeviceAccessMaterial;
  deviceAccessRecoveryBackup?: DeviceAccessRecoveryBackup;
  vaultSnapshot?: VaultSnapshot;
  vaultSnapshotDigest?: string;
  localVaultTrustCheckpoint?: LocalVaultTrustCheckpoint;
  deviceSyncCredentialState?: EncryptedDeviceSyncCredentialState;
  pendingDeviceEnrollment?: PendingDeviceEnrollment;
  unlockedVaultSession?: UnlockedVaultSession;
  unlockedVaultSessionMaterial?: UnlockedVaultSessionMaterial;
  encryptedUnlockedVaultSessionPayload?: EncryptedUnlockedVaultSessionPayload;
  unlockedVaultSessionPayload?: {
    readonly vault: Vault;
  };
};

export type CoreTestPorts = ReturnType<typeof createCoreTestPorts>;

function requirePersistedSnapshot(
  snapshot: VaultSnapshot | undefined,
): VaultSnapshot {
  if (snapshot === undefined) {
    throw new Error("Expected the workflow to persist a vault snapshot.");
  }

  return snapshot;
}

export function replaceVaultSnapshotAfterNextSave(
  ports: CoreTestPorts,
  replacement: VaultSnapshot,
): () => VaultSnapshot {
  const save = vi.mocked(
    ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
  );
  const saveImplementation = save.getMockImplementation();
  let persistedSnapshot: VaultSnapshot | undefined;

  if (saveImplementation === undefined) {
    throw new Error("Expected the local snapshot save fixture implementation.");
  }

  save.mockImplementationOnce(async (params) => {
    await saveImplementation(params);
    persistedSnapshot = params.snapshot;
    ports.saved.vaultSnapshot = replacement;
  });

  return () => requirePersistedSnapshot(persistedSnapshot);
}

export function replaceVaultSnapshotAfterNextInitializedSave(
  ports: CoreTestPorts,
  replacement: VaultSnapshot,
): () => VaultSnapshot {
  const save = vi.mocked(ports.vaultLocalRepository.saveInitializedLocalVault);
  const saveImplementation = save.getMockImplementation();
  let persistedSnapshot: VaultSnapshot | undefined;

  if (saveImplementation === undefined) {
    throw new Error(
      "Expected the initialized vault save fixture implementation.",
    );
  }

  save.mockImplementationOnce(async (params) => {
    await saveImplementation(params);
    persistedSnapshot = params.snapshot;
    ports.saved.vaultSnapshot = replacement;
  });

  return () => requirePersistedSnapshot(persistedSnapshot);
}

export function createCoreTestPorts(
  values: CoreTestValues = createCoreTestValues(),
) {
  const protectionKeyKinds = new WeakMap<
    ArrayBuffer,
    "local" | "new_local" | "recovery" | "rotated_recovery"
  >();
  const recoveryKeyKinds = new WeakMap<ArrayBuffer, "current" | "rotated">();
  const freshBuffer = <T extends ArrayBuffer>(buffer: T): T =>
    buffer.slice(0) as T;
  const saved: SavedCoreRecords = {
    vaultSnapshotDigest: values.vaultSnapshotDigest,
    deviceSyncCredentialState: values.encryptedDeviceSyncCredentialState,
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
      devicePrivateVaultKey: session.unlockedVault.devicePrivateVaultKey,
      deviceLocalProtectionKey: session.unlockedVault.deviceLocalProtectionKey,
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

  const crypto: CryptoPort = {
    algorithmSuite: CURRENT_ALGORITHM_SUITE,
    generateRandomBytes: vi.fn(
      async (byteLength: number) => new ArrayBuffer(byteLength) as RandomBytes,
    ),
    generateDeviceSignKeyPair: vi.fn(
      async (): Promise<DeviceSignKeyPair> => ({
        publicKey: freshBuffer(values.devicePublicSignKey),
        privateKey: freshBuffer(values.devicePrivateSignKey),
      }),
    ),
    generateDeviceVaultKeyPair: vi.fn(
      async (): Promise<DeviceVaultKeyPair> => ({
        publicKey: freshBuffer(values.devicePublicVaultKey),
        privateKey: freshBuffer(values.devicePrivateVaultKey),
      }),
    ),
    generateDeviceLocalProtectionKey: vi.fn(async () =>
      freshBuffer(values.deviceLocalProtectionKey),
    ),
    generateVaultMasterKey: vi.fn(async () =>
      freshBuffer(values.vaultMasterKey),
    ),
    generateRecoveryKey: vi.fn(async () => {
      const recoveryKey = freshBuffer(values.recoverySecretKey);
      recoveryKeyKinds.set(recoveryKey, "current");
      return recoveryKey;
    }),
    generateUnlockedVaultSessionPayloadKey: vi.fn(async () =>
      freshBuffer(values.unlockedVaultSessionPayloadKey),
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
    deriveLocalRootKey: vi.fn(async (_masterPassword, salt) =>
      freshBuffer(
        salt === values.masterPasswordSalt
          ? values.localRootKey
          : values.newLocalRootKey,
      ),
    ),
    deriveLocalKeysProtectionKey: vi.fn(async (_localRootKey, salt) => {
      const isNew = salt === values.newLocalKeysProtectionSalt;
      const protectionKey = freshBuffer(
        isNew
          ? values.newLocalKeysProtectionKey
          : values.localKeysProtectionKey,
      );
      protectionKeyKinds.set(protectionKey, isNew ? "new_local" : "local");
      return protectionKey;
    }),
    deriveRecoveryLocalKeysProtectionKey: vi.fn(async (_recoveryKey, salt) => {
      const isRotated = salt === values.rotatedRecoveryLocalKeysProtectionSalt;
      const protectionKey = freshBuffer(
        isRotated
          ? values.rotatedRecoveryLocalKeysProtectionKey
          : values.recoveryLocalKeysProtectionKey,
      );
      protectionKeyKinds.set(
        protectionKey,
        isRotated ? "rotated_recovery" : "recovery",
      );
      return protectionKey;
    }),
    deriveDeviceEnrollmentPrivateStateProtectionKey: vi.fn(async () =>
      freshBuffer(values.pendingEnrollmentProtectionKey),
    ),
    wrapLocalKeysPayload: vi.fn(async (_localKeysPayload, protectionKey) => {
      const protectionKeyKind = protectionKeyKinds.get(protectionKey);

      if (
        protectionKey === values.newLocalKeysProtectionKey ||
        protectionKeyKind === "new_local"
      ) {
        return values.reprotectedLocalKeys;
      }

      if (
        protectionKey === values.recoveryLocalKeysProtectionKey ||
        protectionKeyKind === "recovery"
      ) {
        return values.recoveryProtectedLocalKeys;
      }

      if (
        protectionKey === values.rotatedRecoveryLocalKeysProtectionKey ||
        protectionKeyKind === "rotated_recovery"
      ) {
        return values.rotatedRecoveryProtectedLocalKeys;
      }

      return values.protectedLocalKeys;
    }),
    unwrapLocalKeysPayload: vi.fn(async () => ({
      devicePrivateSignKey: values.devicePrivateSignKey.slice(
        0,
      ) as typeof values.devicePrivateSignKey,
      devicePrivateVaultKey: values.devicePrivateVaultKey.slice(
        0,
      ) as typeof values.devicePrivateVaultKey,
      deviceLocalProtectionKey: values.deviceLocalProtectionKey.slice(
        0,
      ) as typeof values.deviceLocalProtectionKey,
      vaultTrustAnchor: values.vaultTrustAnchor,
    })),
    wrapDeviceEnrollmentPrivateState: vi.fn(
      async () => values.protectedPendingDeviceEnrollment,
    ),
    unwrapDeviceEnrollmentPrivateState: vi.fn(async () => ({
      ...values.pendingDeviceEnrollmentPrivateState,
      devicePrivateSignKey: values.pendingDevicePrivateSignKey.slice(
        0,
      ) as typeof values.pendingDevicePrivateSignKey,
      devicePrivateVaultKey: values.pendingDevicePrivateVaultKey.slice(
        0,
      ) as typeof values.pendingDevicePrivateVaultKey,
      deviceLocalProtectionKey: values.pendingDeviceLocalProtectionKey.slice(
        0,
      ) as typeof values.pendingDeviceLocalProtectionKey,
    })),
    createDeviceVaultKeyEnvelope: vi.fn(
      async (_vaultMasterKey, recipientPublicKey, context) =>
        recipientPublicKey === values.pendingDevicePublicVaultKey
          ? {
              ...values.pendingDeviceVaultKeyEnvelope,
              recipientDeviceId: context.deviceId,
              vaultKeyGeneration: context.vaultKeyGeneration,
            }
          : {
              ...values.vaultKeyEnvelope,
              recipientDeviceId: context.deviceId,
              vaultKeyGeneration: context.vaultKeyGeneration,
            },
    ),
    openDeviceVaultKeyEnvelope: vi.fn(
      async () =>
        values.vaultMasterKey.slice(0) as typeof values.vaultMasterKey,
    ),
    digestDevicePublicSignKey: vi.fn(async (publicKey) =>
      publicKey === values.pendingDevicePublicSignKey
        ? values.pendingDevicePublicSignKeyDigest
        : values.devicePublicSignKeyDigest,
    ),
    digestDevicePublicVaultKey: vi.fn(async (publicKey) =>
      publicKey === values.pendingDevicePublicVaultKey
        ? "pending-device-public-vault-key-digest"
        : "device-public-vault-key-digest",
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
    verifyDeviceVaultKeyPair: vi.fn(async () => true),
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
    signDeviceEnrollmentRequest: vi.fn(
      async () => values.enrollmentRequestSignature,
    ),
    verifyDeviceEnrollmentRequestSignature: vi.fn(async () => true),
    encryptDeviceSyncCredentialState: vi.fn(async (state) => {
      return state.previousCredentials === undefined
        ? values.encryptedDeviceSyncCredentialState
        : values.replacementEncryptedDeviceSyncCredentialState;
    }),
    decryptDeviceSyncCredentialState: vi.fn(async (encryptedState) =>
      encryptedState === values.replacementEncryptedDeviceSyncCredentialState
        ? {
            currentCredentials: values.replacementSyncCredentials,
            previousCredentials: {
              credentials: values.syncCredentials,
              revokedDeviceIds: [values.pendingDeviceId],
              vaultKeyGeneration: 2,
            },
          }
        : values.deviceSyncCredentialState,
    ),
  };

  const clipboardSecretHash: ClipboardSecretHashPort = {
    hashSecretValue: vi.fn(async (value) => `hash:${value}`),
    compareSecretValueHash: vi.fn(async (left, right) => left === right),
  };

  const activeClipboardOperationLeases = new WeakSet<ClipboardOperationLease>();
  const clipboardOperations: ClipboardOperationCoordinatorPort = {
    isLeaseActive: (lease) => activeClipboardOperationLeases.has(lease),
    runExclusive: async <Result>(
      operation: (lease: ClipboardOperationLease) => Promise<Result>,
    ) => {
      const lease = Object.freeze({}) as ClipboardOperationLease;
      activeClipboardOperationLeases.add(lease);

      try {
        return await operation(lease);
      } finally {
        activeClipboardOperationLeases.delete(lease);
      }
    },
  };

  const bip39: Bip39Port = {
    recoveryKeyToMnemonic: vi.fn(async (recoveryKey) =>
      recoveryKey === values.rotatedRecoverySecretKey ||
      recoveryKeyKinds.get(recoveryKey) === "rotated"
        ? values.rotatedRecoveryMnemonicKey
        : values.recoveryMnemonicKey,
    ),
    mnemonicToRecoveryKey: vi.fn(async (recoveryMnemonicKey) => {
      const isRotated =
        recoveryMnemonicKey === values.rotatedRecoveryMnemonicKey;
      const recoveryKey = freshBuffer(
        isRotated ? values.rotatedRecoverySecretKey : values.recoverySecretKey,
      );
      recoveryKeyKinds.set(recoveryKey, isRotated ? "rotated" : "current");
      return recoveryKey;
    }),
  };

  const vaultLocalRepository: VaultLocalRepositoryPort = {
    saveInitializedLocalVault: vi.fn(
      async ({
        descriptor,
        deviceAccessMaterial,
        deviceAccessRecoveryBackup,
        snapshot,
        checkpoint,
        syncCredentialState,
      }) => {
        if (
          saved.localVaultDescriptor !== undefined ||
          saved.deviceAccessMaterial !== undefined ||
          saved.deviceAccessRecoveryBackup !== undefined ||
          saved.vaultSnapshot !== undefined ||
          saved.localVaultTrustCheckpoint !== undefined
        ) {
          throw new LocalVaultAlreadyInitializedError(descriptor.vaultId);
        }

        if (
          deviceAccessMaterial.revision !== INITIAL_DEVICE_ACCESS_REVISION ||
          deviceAccessRecoveryBackup.revision !==
            INITIAL_DEVICE_ACCESS_REVISION ||
          !areDeviceAccessRecordsConsistent(
            deviceAccessMaterial,
            deviceAccessRecoveryBackup,
          )
        ) {
          throw new DeviceAccessMaterialChangedError(descriptor.vaultId);
        }

        saved.localVaultDescriptor = descriptor;
        saved.deviceAccessMaterial = deviceAccessMaterial;
        saved.deviceAccessRecoveryBackup = deviceAccessRecoveryBackup;
        saved.vaultSnapshot = snapshot;
        saved.vaultSnapshotDigest = checkpoint.payload.snapshotDigest;
        saved.localVaultTrustCheckpoint = checkpoint;
        saved.deviceSyncCredentialState = syncCredentialState;
      },
    ),
    removePersistedLocalVault: vi.fn(async () => {
      saved.localVaultDescriptor = undefined;
      saved.deviceAccessMaterial = undefined;
      saved.deviceAccessRecoveryBackup = undefined;
      saved.vaultSnapshot = undefined;
      saved.vaultSnapshotDigest = undefined;
      saved.localVaultTrustCheckpoint = undefined;
      saved.deviceSyncCredentialState = undefined;
    }),
    removePersistedLocalVaultIfSnapshotMatches: vi.fn(
      async (vaultId, expectedSnapshotDigest) => {
        if (
          saved.vaultSnapshot?.metadata.id !== vaultId ||
          saved.vaultSnapshotDigest !== expectedSnapshotDigest
        ) {
          return false;
        }

        saved.localVaultDescriptor = undefined;
        saved.deviceAccessMaterial = undefined;
        saved.deviceAccessRecoveryBackup = undefined;
        saved.vaultSnapshot = undefined;
        saved.vaultSnapshotDigest = undefined;
        saved.localVaultTrustCheckpoint = undefined;
        saved.deviceSyncCredentialState = undefined;
        return true;
      },
    ),
    saveLocalVaultDescriptor: vi.fn(async (descriptor) => {
      saved.localVaultDescriptor = descriptor;
    }),
    getLocalVaultDescriptor: vi.fn(async (vaultId) => {
      const descriptor = saved.localVaultDescriptor;

      return descriptor !== undefined && descriptor.vaultId === vaultId
        ? descriptor
        : null;
    }),
    listLocalVaultDescriptors: vi.fn(),
    removeLocalVaultDescriptor: vi.fn(),
    saveDeviceAccessRecords: vi.fn(
      async ({
        expectedDeviceAccessMaterialRevision,
        expectedDeviceAccessMaterialGenerationId,
        expectedDeviceAccessRecoveryBackupRevision,
        expectedDeviceAccessRecoveryBackupGenerationId,
        deviceAccessMaterial,
        deviceAccessRecoveryBackup,
      }) => {
        const currentDeviceAccessMaterial = saved.deviceAccessMaterial;
        const currentDeviceAccessRecoveryBackup =
          saved.deviceAccessRecoveryBackup;
        const currentDeviceAccessMaterialRevision =
          currentDeviceAccessMaterial === undefined ||
          currentDeviceAccessMaterial.vaultId !== deviceAccessMaterial.vaultId
            ? null
            : currentDeviceAccessMaterial.revision;
        const currentDeviceAccessMaterialGenerationId =
          currentDeviceAccessMaterial === undefined ||
          currentDeviceAccessMaterial.vaultId !== deviceAccessMaterial.vaultId
            ? null
            : currentDeviceAccessMaterial.localAccessGenerationId;
        const nextDeviceAccessMaterialRevision =
          expectedDeviceAccessMaterialRevision === null
            ? INITIAL_DEVICE_ACCESS_REVISION
            : getNextDeviceAccessRevision(expectedDeviceAccessMaterialRevision);
        const nextDeviceAccessRecoveryBackupRevision =
          getNextDeviceAccessRevision(
            expectedDeviceAccessRecoveryBackupRevision,
          );
        const isExpectedMaterialAbsent =
          expectedDeviceAccessMaterialRevision === null &&
          expectedDeviceAccessMaterialGenerationId === null;
        const hasSplitMaterialExpectation =
          (expectedDeviceAccessMaterialRevision === null) !==
          (expectedDeviceAccessMaterialGenerationId === null);
        const isCurrentMaterialAbsent =
          currentDeviceAccessMaterial === undefined;

        if (
          nextDeviceAccessMaterialRevision === null ||
          nextDeviceAccessRecoveryBackupRevision === null ||
          hasSplitMaterialExpectation ||
          currentDeviceAccessRecoveryBackup === undefined ||
          isCurrentMaterialAbsent !== isExpectedMaterialAbsent ||
          !isValidLocalAccessGenerationId(
            expectedDeviceAccessRecoveryBackupGenerationId,
          ) ||
          (expectedDeviceAccessMaterialGenerationId !== null &&
            !isValidLocalAccessGenerationId(
              expectedDeviceAccessMaterialGenerationId,
            )) ||
          !isValidDeviceAccessRecordIdentity(
            currentDeviceAccessRecoveryBackup,
          ) ||
          (currentDeviceAccessMaterial !== undefined &&
            !areDeviceAccessRecordsConsistent(
              currentDeviceAccessMaterial,
              currentDeviceAccessRecoveryBackup,
            )) ||
          !areDeviceAccessRecordsConsistent(
            deviceAccessMaterial,
            deviceAccessRecoveryBackup,
          ) ||
          !haveSameDeviceAccessIdentity(
            currentDeviceAccessRecoveryBackup,
            deviceAccessRecoveryBackup,
          ) ||
          currentDeviceAccessMaterialRevision !==
            expectedDeviceAccessMaterialRevision ||
          currentDeviceAccessMaterialGenerationId !==
            expectedDeviceAccessMaterialGenerationId ||
          currentDeviceAccessRecoveryBackup?.localAccessGenerationId !==
            expectedDeviceAccessRecoveryBackupGenerationId ||
          currentDeviceAccessRecoveryBackup?.revision !==
            expectedDeviceAccessRecoveryBackupRevision ||
          deviceAccessMaterial.localAccessGenerationId ===
            expectedDeviceAccessRecoveryBackupGenerationId ||
          deviceAccessMaterial.revision !== nextDeviceAccessMaterialRevision ||
          deviceAccessRecoveryBackup.revision !==
            nextDeviceAccessRecoveryBackupRevision
        ) {
          throw new DeviceAccessMaterialChangedError(
            deviceAccessMaterial.vaultId,
          );
        }

        saved.deviceAccessMaterial = deviceAccessMaterial;
        saved.deviceAccessRecoveryBackup = deviceAccessRecoveryBackup;
      },
    ),
    getDeviceAccessRecords: vi.fn(async (vaultId) => {
      const deviceAccessMaterial = saved.deviceAccessMaterial;
      const deviceAccessRecoveryBackup = saved.deviceAccessRecoveryBackup;

      return {
        deviceAccessMaterial:
          deviceAccessMaterial !== undefined &&
          deviceAccessMaterial.vaultId === vaultId
            ? deviceAccessMaterial
            : null,
        deviceAccessRecoveryBackup:
          deviceAccessRecoveryBackup !== undefined &&
          deviceAccessRecoveryBackup.vaultId === vaultId
            ? deviceAccessRecoveryBackup
            : null,
      };
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
      async ({
        expectedSnapshotDigest,
        snapshot,
        checkpoint,
        syncCredentialState,
      }) => {
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

        if (syncCredentialState !== undefined) {
          saved.deviceSyncCredentialState = syncCredentialState ?? undefined;
        }
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
    saveDeviceSyncCredentialState: vi.fn(async (_vaultId, state) => {
      saved.deviceSyncCredentialState = state;
    }),
    getDeviceSyncCredentialState: vi.fn(async (vaultId) =>
      vaultId === values.vaultId
        ? (saved.deviceSyncCredentialState ?? null)
        : null,
    ),
    removeDeviceSyncCredentialState: vi.fn(async () => {
      saved.deviceSyncCredentialState = undefined;
    }),
    savePendingDeviceEnrollment: vi.fn(async (enrollment) => {
      saved.pendingDeviceEnrollment = enrollment;
    }),
    getPendingDeviceEnrollment: vi.fn(async (requestId) => {
      const enrollment = saved.pendingDeviceEnrollment;

      return enrollment !== undefined && enrollment.requestId === requestId
        ? enrollment
        : null;
    }),
    removePendingDeviceEnrollment: vi.fn(async (requestId) => {
      if (saved.pendingDeviceEnrollment?.requestId === requestId) {
        saved.pendingDeviceEnrollment = undefined;
      }
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
      getPersistedUnlockedVaultSessionIdentity: vi.fn(async () => {
        const material = saved.unlockedVaultSessionMaterial;
        return material === undefined
          ? null
          : {
              sessionId: material.sessionId,
              vaultId: material.vaultId,
              sourceSnapshotVersionVector: material.sourceSnapshotVersionVector,
            };
      }),
      evictCachedUnlockedVaultSessionMaterial: vi.fn(async () => undefined),
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
      .mockResolvedValueOnce(values.localAccessGenerationId)
      .mockResolvedValue(values.sessionId),
  };

  const unlockedVaultSession = new UnlockedVaultSessionService(
    unlockedVaultSessionMaterialRepository,
    encryptedUnlockedVaultSessionPayloadRepository,
    crypto,
    ids,
    clipboardOperations,
  );
  const sessionServices = {
    unlockedVaultSession,
  };

  const activateSessionOriginal =
    sessionServices.unlockedVaultSession.activate.bind(
      sessionServices.unlockedVaultSession,
    );
  const activateSessionWithAutoLockOriginal =
    sessionServices.unlockedVaultSession.activateWithAutoLock.bind(
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
  const cleanupActiveSessionOriginal =
    sessionServices.unlockedVaultSession.cleanupActiveSession.bind(
      sessionServices.unlockedVaultSession,
    );

  vi.spyOn(sessionServices.unlockedVaultSession, "activate").mockImplementation(
    async (
      activationGeneration,
      unlockedVault,
      sourceSnapshotVersionVector,
      coordinationLease,
    ) => {
      const sessionId = await activateSessionOriginal(
        activationGeneration,
        unlockedVault,
        sourceSnapshotVersionVector,
        coordinationLease,
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
    "activateWithAutoLock",
  ).mockImplementation(
    async (
      activationGeneration,
      unlockedVault,
      sourceSnapshotVersionVector,
      installAutoLock,
      rollbackAutoLock,
      coordinationLease,
    ) => {
      const activatedSession = await activateSessionWithAutoLockOriginal(
        activationGeneration,
        unlockedVault,
        sourceSnapshotVersionVector,
        installAutoLock,
        rollbackAutoLock,
        coordinationLease,
      );
      unlockedVaultSessionMirror = {
        sessionId: activatedSession.sessionId,
        unlockedVault,
        sourceSnapshotVersionVector,
      };

      return activatedSession;
    },
  );
  vi.spyOn(
    sessionServices.unlockedVaultSession,
    "commitPersistedSnapshot",
  ).mockImplementation(
    async (
      sessionId,
      unlockedVault,
      sourceSnapshotVersionVector,
      coordinationLease,
    ) => {
      await commitPersistedSnapshotOriginal(
        sessionId,
        unlockedVault,
        sourceSnapshotVersionVector,
        coordinationLease,
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
  vi.spyOn(
    sessionServices.unlockedVaultSession,
    "cleanupActiveSession",
  ).mockImplementation(
    async (
      requiredVaultId,
      invalidateWhenUnavailable,
      beforeRemoval,
      afterRemoval,
      coordinationLease,
    ) => {
      const result = await cleanupActiveSessionOriginal(
        requiredVaultId,
        invalidateWhenUnavailable,
        beforeRemoval,
        afterRemoval,
        coordinationLease,
      );

      if (result === "removed") {
        unlockedVaultSessionMirror = undefined;
      }

      return result;
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
    setup: vi.fn(async (input) =>
      input === values.replacementSyncConfigInput
        ? values.replacementSyncAccess
        : values.syncAccess,
    ),
    getLatestVaultSnapshotDescriptor: vi.fn(async () => null),
    downloadVaultSnapshot: vi.fn(),
    uploadVaultSnapshot: vi.fn(async () => undefined),
    removeVaultSnapshots: vi.fn(async () => undefined),
    checkVaultAccess: vi.fn(async () => "authentication_rejected" as const),
  };

  let activeVaultLockTask: VaultLockTask | null = null;
  const vaultLockTasks: VaultLockTaskRepositoryPort = {
    save: vi.fn(async (task) => {
      activeVaultLockTask = task;
    }),
    get: vi.fn(async () => activeVaultLockTask),
    removeIfActionIsActive: vi.fn(async (actionId) => {
      if (activeVaultLockTask?.actionId !== actionId) {
        return false;
      }

      activeVaultLockTask = null;
      return true;
    }),
  };

  const vaultDisplayName: VaultDisplayNamePort = {
    generateVaultDisplayName: vi.fn(async () => values.vaultDisplayName),
  };

  return {
    crypto,
    clipboardOperations,
    clipboardSecretHash,
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
