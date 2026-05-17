import { vi } from "vitest";
import { CURRENT_ALGORITHM_SUITE } from "../../domain/crypto/algorithm-suite.const";
import type { RandomBytes } from "../../domain/crypto/brand-keys";
import type { DeviceSignKeyPair } from "../../domain/device/brand-keys";
import type { DeviceAccessMaterial } from "../../domain/device/device-access-material";
import type { VaultSnapshot } from "../../domain/snapshot/vault-snapshot";
import type { UnlockedVault } from "../../domain/vault/unlocked-vault";
import type { Bip39Port } from "../../ports/bip39.port";
import type { ClockPort } from "../../ports/clock.port";
import type { CryptoPort } from "../../ports/crypto.port";
import type { IdPort } from "../../ports/id.port";
import type { UnlockedVaultRepositoryPort } from "../../ports/unlocked-vault-repository.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault-local-repository.port";
import { bytes, createCoreTestValues, type CoreTestValues } from "./values";

export type SavedCoreRecords = {
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
    generateRandomBytes: vi.fn(async () => bytes<RandomBytes>()),
    generateDeviceSignKeyPair: vi.fn(async () => deviceSignKeyPair),
    generateVaultMasterKey: vi.fn(async () => values.vaultMasterKey),
    generateDeviceSlotKey: vi.fn(async () => values.deviceSlotKey),
    generateRecoveryKey: vi.fn(async () => values.recoverySecretKey),
    generateMasterPasswordSalt: vi.fn(async () => values.masterPasswordSalt),
    generateLocalKeysProtectionSalt: vi.fn(
      async () => values.localKeysProtectionSalt,
    ),
    deriveLocalRootKey: vi.fn(async () => values.localRootKey),
    deriveLocalKeysProtectionKey: vi.fn(
      async () => values.localKeysProtectionKey,
    ),
    deriveDeviceSlotVaultMasterKeyProtectionKey: vi.fn(
      async () => values.deviceSlotVaultMasterKeyProtectionKey,
    ),
    deriveRecoveryVaultMasterKeyProtectionKey: vi.fn(
      async () => values.recoveryVaultMasterKeyProtectionKey,
    ),
    wrapLocalKeysPayload: vi.fn(async () => values.protectedLocalKeys),
    unwrapLocalKeysPayload: vi.fn(),
    wrapVaultMasterKey: vi
      .fn()
      .mockResolvedValueOnce(values.protectedDeviceVaultMasterKey)
      .mockResolvedValueOnce(values.protectedRecoveryVaultMasterKey),
    unwrapVaultMasterKey: vi.fn(),
    encryptVaultSnapshotContent: vi.fn(async () => values.encryptedVault),
    decryptVaultSnapshotContent: vi.fn(),
    signVaultSnapshot: vi.fn(async () => values.snapshotSignature),
    verifyVaultSnapshotSignature: vi.fn(),
  };

  const bip39: Bip39Port = {
    recoveryKeyToMnemonic: vi.fn(async () => values.recoveryMnemonicKey),
    mnemonicToRecoveryKey: vi.fn(),
  };

  const vaultLocalRepository: VaultLocalRepositoryPort = {
    saveDeviceAccessMaterial: vi.fn(async (deviceAccessMaterial) => {
      saved.deviceAccessMaterial = deviceAccessMaterial;
    }),
    getDeviceAccessMaterial: vi.fn(),
    removeDeviceAccessMaterial: vi.fn(),
    saveVaultSnapshot: vi.fn(async (vaultSnapshot) => {
      saved.vaultSnapshot = vaultSnapshot;
    }),
    getVaultSnapshot: vi.fn(),
    removeVaultSnapshot: vi.fn(),
  };

  const unlockedVaultRepository: UnlockedVaultRepositoryPort = {
    saveUnlockedVault: vi.fn(async (unlockedVault) => {
      saved.unlockedVault = unlockedVault;
    }),
    getUnlockedVault: vi.fn(),
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

  return {
    crypto,
    bip39,
    vaultLocalRepository,
    unlockedVaultRepository,
    ids,
    clock,
    saved,
  };
}
