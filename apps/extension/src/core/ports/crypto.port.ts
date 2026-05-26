import type { AlgorithmSuite } from "../domain/crypto/algorithm-suite.type";
import type { RandomBytes } from "../domain/crypto/brand-keys";
import type {
  ProtectionKeyFor,
  SerializedEncrypted,
  SerializedSignatureOf,
  SerializedWrapped,
} from "../domain/crypto/protected-artifact";
import type {
  DevicePrivateSignKey,
  DevicePublicSignKey,
  DeviceSignKeyPair,
  DeviceSlotKey,
} from "../domain/device/brand-keys";
import type {
  LocalKeysPayload,
  LocalRootKey,
} from "../domain/local-protection/local-protection.type";
import type { RawMasterPassword } from "../domain/master-password";
import type { RecoverySecretKey } from "../domain/recovery/brand-keys";
import type { VaultMasterKey } from "../domain/snapshot/brand-keys";
import type {
  UnsignedVaultSnapshot,
  VaultSnapshot,
} from "../domain/snapshot/vault-snapshot";
import type { Vault } from "../domain/vault/vault";

export interface CryptoPort {
  // Suite
  algorithmSuite: AlgorithmSuite;

  // Randomness
  generateRandomBytes: (byteLength: number) => Promise<RandomBytes>;

  // Secret comparison
  hashSecretValue: (value: string) => Promise<string>;

  // Key generation
  generateDeviceSignKeyPair: () => Promise<DeviceSignKeyPair>;
  generateVaultMasterKey: () => Promise<VaultMasterKey>;
  generateDeviceSlotKey: () => Promise<DeviceSlotKey>;
  generateRecoveryKey: () => Promise<RecoverySecretKey>;

  // Salt generation
  generateMasterPasswordSalt: () => Promise<RandomBytes>;
  generateLocalKeysProtectionSalt: () => Promise<RandomBytes>;

  // Password-based local protection
  deriveLocalRootKey: (
    masterPassword: RawMasterPassword,
    salt: RandomBytes,
  ) => Promise<LocalRootKey>;
  deriveLocalKeysProtectionKey: (
    localRootKey: LocalRootKey,
    salt: RandomBytes,
  ) => Promise<ProtectionKeyFor<LocalKeysPayload>>;

  // Vault master key slot protection
  deriveDeviceSlotVaultMasterKeyProtectionKey: (
    deviceSlotKey: DeviceSlotKey,
  ) => Promise<ProtectionKeyFor<VaultMasterKey>>;
  deriveRecoveryVaultMasterKeyProtectionKey: (
    recoveryKey: RecoverySecretKey,
  ) => Promise<ProtectionKeyFor<VaultMasterKey>>;

  // Key wrapping
  wrapLocalKeysPayload: (
    localKeysPayload: LocalKeysPayload,
    protectionKey: ProtectionKeyFor<LocalKeysPayload>,
  ) => Promise<SerializedWrapped<LocalKeysPayload>>;
  unwrapLocalKeysPayload: (
    protectedLocalKeys: SerializedWrapped<LocalKeysPayload>,
    protectionKey: ProtectionKeyFor<LocalKeysPayload>,
  ) => Promise<LocalKeysPayload>;
  wrapVaultMasterKey: (
    vaultMasterKey: VaultMasterKey,
    protectionKey: ProtectionKeyFor<VaultMasterKey>,
  ) => Promise<SerializedWrapped<VaultMasterKey>>;
  unwrapVaultMasterKey: (
    protectedVaultMasterKey: SerializedWrapped<VaultMasterKey>,
    protectionKey: ProtectionKeyFor<VaultMasterKey>,
  ) => Promise<VaultMasterKey>;

  // Vault snapshot content protection
  encryptVaultSnapshotContent: (
    vault: Vault,
    vaultMasterKey: VaultMasterKey,
  ) => Promise<SerializedEncrypted<Vault>>;
  decryptVaultSnapshotContent: (
    encryptedVault: SerializedEncrypted<Vault>,
    vaultMasterKey: VaultMasterKey,
  ) => Promise<Vault>;

  // Vault snapshot authenticity
  signVaultSnapshot: (
    snapshot: UnsignedVaultSnapshot,
    privateKey: DevicePrivateSignKey,
  ) => Promise<SerializedSignatureOf<UnsignedVaultSnapshot>>;
  verifyVaultSnapshotSignature: (
    snapshot: VaultSnapshot,
    publicKey: DevicePublicSignKey,
  ) => Promise<boolean>;
}
