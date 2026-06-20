import type { AlgorithmSuite } from "../../domain/crypto/algorithm-suite.type";
import type { RandomBytes } from "../../domain/crypto/brand-keys";
import type {
  ProtectionKeyFor,
  SerializedEncrypted,
  SerializedSignatureOf,
  SerializedWrapped,
} from "../../domain/crypto/protected-artifact";
import type {
  DeviceEnrollmentSecret,
  DevicePrivateSignKey,
  DevicePublicSignKey,
  DeviceSignKeyPair,
  DeviceSlotKey,
} from "../../domain/device-trust/brand-keys";
import type { DeviceEnrollmentAuthorizationPayload } from "../../domain/device-trust/device-enrollment-authorization";
import type {
  LocalKeysPayload,
  LocalRootKey,
} from "../../domain/device-trust/local-protection.type";
import type { RawMasterPassword } from "../../domain/master-password";
import type { RecoverySecretKey } from "../../domain/recovery/brand-keys";
import type { VaultMasterKey } from "../../domain/snapshot/brand-keys";
import type { UnlockedVaultSessionPayloadKey } from "../../domain/session/unlocked-vault-session-payload-key";
import type {
  UnsignedVaultSnapshot,
  VaultSnapshot,
} from "../../domain/snapshot/vault-snapshot";
import type { Vault } from "../../domain/vault/vault";
import type { VersionVector } from "../../domain/versioning/version-vector.type";

export interface CryptoPort {
  // Suite
  algorithmSuite: AlgorithmSuite;

  // Randomness
  generateRandomBytes: (byteLength: number) => Promise<RandomBytes>;

  // Secret comparison
  hashSecretValue: (value: string) => Promise<string>;
  compareSecretValueHash: (left: string, right: string) => Promise<boolean>;

  // Key generation
  generateDeviceSignKeyPair: () => Promise<DeviceSignKeyPair>;
  generateVaultMasterKey: () => Promise<VaultMasterKey>;
  generateDeviceSlotKey: () => Promise<DeviceSlotKey>;
  generateDeviceEnrollmentSecret: () => Promise<DeviceEnrollmentSecret>;
  generateRecoveryKey: () => Promise<RecoverySecretKey>;
  generateUnlockedVaultSessionPayloadKey: () => Promise<UnlockedVaultSessionPayloadKey>;

  // Salt generation
  generateMasterPasswordSalt: () => Promise<RandomBytes>;
  generateLocalKeysProtectionSalt: () => Promise<RandomBytes>;
  generateRecoveryLocalKeysProtectionSalt: () => Promise<RandomBytes>;

  // Password-based local protection
  deriveLocalRootKey: (
    masterPassword: RawMasterPassword,
    salt: RandomBytes,
  ) => Promise<LocalRootKey>;
  deriveLocalKeysProtectionKey: (
    localRootKey: LocalRootKey,
    salt: RandomBytes,
  ) => Promise<ProtectionKeyFor<LocalKeysPayload>>;
  deriveRecoveryLocalKeysProtectionKey: (
    recoveryKey: RecoverySecretKey,
    salt: RandomBytes,
  ) => Promise<ProtectionKeyFor<LocalKeysPayload>>;

  // Vault master key slot protection
  deriveDeviceSlotVaultMasterKeyProtectionKey: (
    deviceSlotKey: DeviceSlotKey,
  ) => Promise<ProtectionKeyFor<VaultMasterKey>>;
  deriveEnrollmentVaultMasterKeyProtectionKey: (
    enrollmentSecret: DeviceEnrollmentSecret,
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
  digestProtectedVaultMasterKey: (
    protectedVaultMasterKey: SerializedWrapped<VaultMasterKey>,
  ) => Promise<string>;
  digestDevicePublicSignKey: (
    publicSignKey: DevicePublicSignKey,
  ) => Promise<string>;

  // Vault snapshot content protection
  encryptVaultSnapshotContent: (
    vault: Vault,
    vaultMasterKey: VaultMasterKey,
  ) => Promise<SerializedEncrypted<Vault>>;
  decryptVaultSnapshotContent: (
    encryptedVault: SerializedEncrypted<Vault>,
    vaultMasterKey: VaultMasterKey,
  ) => Promise<Vault>;

  // Unlocked vault session payload protection
  encryptUnlockedVaultSessionPayload: (
    payload: {
      readonly vault: Vault;
    },
    payloadKey: UnlockedVaultSessionPayloadKey,
    context: {
      readonly sessionId: string;
      readonly vaultId: string;
      readonly sourceSnapshotVersionVector: VersionVector;
    },
  ) => Promise<
    SerializedEncrypted<{
      readonly vault: Vault;
    }>
  >;
  decryptUnlockedVaultSessionPayload: (
    encryptedPayload: SerializedEncrypted<{
      readonly vault: Vault;
    }>,
    payloadKey: UnlockedVaultSessionPayloadKey,
    context: {
      readonly sessionId: string;
      readonly vaultId: string;
      readonly sourceSnapshotVersionVector: VersionVector;
    },
  ) => Promise<{
    readonly vault: Vault;
  }>;

  // Vault snapshot authenticity
  signVaultSnapshot: (
    snapshot: UnsignedVaultSnapshot,
    privateKey: DevicePrivateSignKey,
  ) => Promise<SerializedSignatureOf<UnsignedVaultSnapshot>>;
  verifyVaultSnapshotSignature: (
    snapshot: VaultSnapshot,
    publicKey: DevicePublicSignKey,
  ) => Promise<boolean>;
  verifyDeviceSignKeyPair: (
    publicKey: DevicePublicSignKey,
    privateKey: DevicePrivateSignKey,
  ) => Promise<boolean>;

  // Device enrollment authorization
  signDeviceEnrollmentAuthorization: (
    authorization: DeviceEnrollmentAuthorizationPayload,
    privateKey: DevicePrivateSignKey,
  ) => Promise<SerializedSignatureOf<DeviceEnrollmentAuthorizationPayload>>;
  verifyDeviceEnrollmentAuthorizationSignature: (
    authorization: DeviceEnrollmentAuthorizationPayload,
    signature: SerializedSignatureOf<DeviceEnrollmentAuthorizationPayload>,
    publicKey: DevicePublicSignKey,
  ) => Promise<boolean>;
}
