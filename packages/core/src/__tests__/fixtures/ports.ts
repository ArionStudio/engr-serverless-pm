import { vi } from "vitest";
import { CURRENT_ALGORITHM_SUITE } from "../../domain/crypto/algorithm-suite.const";
import type { RandomBytes } from "../../domain/crypto/brand-keys";
import type { DeviceSignKeyPair } from "../../domain/device/brand-keys";
import type { DeviceAccessMaterial } from "../../domain/device/device-access-material";
import type { VaultSnapshot } from "../../domain/snapshot/vault-snapshot";
import type { LocalVaultDescriptor } from "../../domain/vault/local-vault-descriptor";
import type {
  EncryptedUnlockedVaultSessionPayload,
  UnlockedVaultSession,
  UnlockedVaultSessionMaterial,
} from "../../domain/vault/unlocked-vault-session";
import type { Bip39Port } from "../../ports/crypto/bip39.port";
import type { ClockPort } from "../../ports/system/clock.port";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { EncryptedUnlockedVaultSessionPayloadRepositoryPort } from "../../ports/vault/encrypted-unlocked-vault-session-payload-repository.port";
import type { IdPort } from "../../ports/system/id.port";
import type { ScheduledTaskPort } from "../../ports/system/scheduled-task.port";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import type { VaultDisplayNamePort } from "../../ports/vault/vault-display-name.port";
import type { VaultLockTaskRepositoryPort } from "../../ports/vault/vault-lock-task-repository.port";
import type { UnlockedVaultRepositoryPort } from "../../ports/vault/unlocked-vault-repository.port";
import type { UnlockedVaultSessionMaterialRepositoryPort } from "../../ports/vault/unlocked-vault-session-material-repository.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import { createCoreTestValues, type CoreTestValues } from "./values";

export type SavedCoreRecords = {
  localVaultDescriptor?: LocalVaultDescriptor;
  deviceAccessMaterial?: DeviceAccessMaterial;
  vaultSnapshot?: VaultSnapshot;
  unlockedVaultSession?: UnlockedVaultSession;
  unlockedVaultSessionMaterial?: UnlockedVaultSessionMaterial;
  encryptedUnlockedVaultSessionPayload?: EncryptedUnlockedVaultSessionPayload;
};

export type CoreTestPorts = ReturnType<typeof createCoreTestPorts>;

export function createCoreTestPorts(
  values: CoreTestValues = createCoreTestValues(),
) {
  const saved: SavedCoreRecords = {};

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
    wrapLocalKeysPayload: vi.fn(async (_localKeysPayload, protectionKey) =>
      protectionKey === values.newLocalKeysProtectionKey
        ? values.reprotectedLocalKeys
        : values.protectedLocalKeys,
    ),
    unwrapLocalKeysPayload: vi.fn(async () => ({
      deviceSlotKey: values.deviceSlotKey,
      devicePrivateSignKey: values.devicePrivateSignKey,
    })),
    wrapVaultMasterKey: vi
      .fn()
      .mockResolvedValueOnce(values.protectedDeviceVaultMasterKey)
      .mockResolvedValueOnce(values.protectedRecoveryVaultMasterKey),
    unwrapVaultMasterKey: vi.fn(async () => values.vaultMasterKey),
    encryptVaultSnapshotContent: vi.fn(async () => values.encryptedVault),
    decryptVaultSnapshotContent: vi.fn(async () => values.decryptedVault),
    encryptUnlockedVaultSessionPayload: vi.fn(
      async () => values.encryptedUnlockedVaultSessionPayload,
    ),
    decryptUnlockedVaultSessionPayload: vi.fn(async () => ({
      vault: values.decryptedVault,
    })),
    signVaultSnapshot: vi.fn(async () => values.snapshotSignature),
    verifyVaultSnapshotSignature: vi.fn(async () => true),
  };

  const bip39: Bip39Port = {
    recoveryKeyToMnemonic: vi.fn(async () => values.recoveryMnemonicKey),
    mnemonicToRecoveryKey: vi.fn(),
  };

  const vaultLocalRepository: VaultLocalRepositoryPort = {
    saveInitializedLocalVault: vi.fn(
      async ({ descriptor, deviceAccessMaterial, snapshot }) => {
        saved.localVaultDescriptor = descriptor;
        saved.deviceAccessMaterial = deviceAccessMaterial;
        saved.vaultSnapshot = snapshot;
      },
    ),
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
    removeDeviceAccessMaterial: vi.fn(),
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

  const unlockedVaultRepository: UnlockedVaultRepositoryPort = {
    saveUnlockedVaultSession: vi.fn(async (session) => {
      saved.unlockedVaultSession = session;
    }),
    getUnlockedVaultSession: vi.fn(
      async () => saved.unlockedVaultSession ?? null,
    ),
    removeUnlockedVaultSession: vi.fn(async () => {
      saved.unlockedVaultSession = undefined;
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
      }),
    };

  const ids: IdPort = {
    generateId: vi
      .fn()
      .mockResolvedValueOnce(values.vaultId)
      .mockResolvedValueOnce(values.deviceId),
  };

  const clock: ClockPort = {
    now: vi.fn(() => values.timestamp),
  };

  const scheduledTasks: ScheduledTaskPort = {
    scheduleTask: vi.fn(async () => undefined),
    cancelTask: vi.fn(async () => undefined),
  };

  const syncProvider: SyncProviderPort = {
    setup: vi.fn(async () => values.syncConfig),
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
    unlockedVaultRepository,
    unlockedVaultSessionMaterialRepository,
    encryptedUnlockedVaultSessionPayloadRepository,
    ids,
    clock,
    scheduledTasks,
    syncProvider,
    vaultLockTasks,
    vaultDisplayName,
    saved,
  };
}
