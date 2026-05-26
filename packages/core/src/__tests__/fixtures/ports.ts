import { vi } from "vitest";
import { CURRENT_ALGORITHM_SUITE } from "../../domain/crypto/algorithm-suite.const";
import type { RandomBytes } from "../../domain/crypto/brand-keys";
import type { DeviceSignKeyPair } from "../../domain/device/brand-keys";
import type { DeviceAccessMaterial } from "../../domain/device/device-access-material";
import type { VaultSnapshot } from "../../domain/snapshot/vault-snapshot";
import type { LocalVaultDescriptor } from "../../domain/vault/local-vault-descriptor";
import type { UnlockedVault } from "../../domain/vault/unlocked-vault";
import type { Bip39Port } from "../../ports/bip39.port";
import type { ClockPort } from "../../ports/clock.port";
import type { CryptoPort } from "../../ports/crypto.port";
import type { IdPort } from "../../ports/id.port";
import type { ScheduledTaskPort } from "../../ports/scheduled-task.port";
import type { VaultDisplayNamePort } from "../../ports/vault-display-name.port";
import type { VaultLockTaskRepositoryPort } from "../../ports/vault-lock-task-repository.port";
import type { UnlockedVaultRepositoryPort } from "../../ports/unlocked-vault-repository.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault-local-repository.port";
import { createCoreTestValues, type CoreTestValues } from "./values";

export type SavedCoreRecords = {
  localVaultDescriptor?: LocalVaultDescriptor;
  deviceAccessMaterial?: DeviceAccessMaterial;
  vaultSnapshot?: VaultSnapshot;
  unlockedVault?: UnlockedVault;
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
    saveUnlockedVault: vi.fn(async (unlockedVault) => {
      saved.unlockedVault = unlockedVault;
    }),
    getUnlockedVault: vi.fn(async () => saved.unlockedVault ?? null),
    removeUnlockedVault: vi.fn(),
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
    ids,
    clock,
    scheduledTasks,
    vaultLockTasks,
    vaultDisplayName,
    saved,
  };
}
