import type { AlgorithmSuite } from "../../domain/crypto/algorithm-suite.type";
import type { RandomBytes } from "../../domain/crypto/brand-keys";
import type {
  ProtectionKeyFor,
  SerializedEncrypted,
  SerializedSignatureOf,
  SerializedWrapped,
} from "../../domain/crypto/protected-artifact";
import type {
  DeviceLocalProtectionKey,
  DevicePrivateSignKey,
  DevicePublicSignKey,
  DeviceSignKeyPair,
  DeviceVaultKeyPair,
  DeviceVaultPrivateKey,
  DeviceVaultPublicKey,
} from "../../domain/device-trust/brand-keys";
import type {
  DeviceEnrollmentPrivateState,
  DeviceEnrollmentPrivateStateProtectionKey,
  DeviceEnrollmentRequest,
  DeviceEnrollmentRequestPayload,
  LocalVaultTrustCheckpoint,
  LocalVaultTrustCheckpointPayload,
  VaultTrustCertificate,
  VaultTrustCertificatePayload,
} from "../../domain/device-trust";
import type {
  LocalKeysPayload,
  LocalRootKey,
} from "../../domain/device-trust/local-protection.type";
import type { RawMasterPassword } from "../../domain/master-password";
import type { RecoverySecretKey } from "../../domain/recovery/brand-keys";
import type { VaultMasterKey } from "../../domain/snapshot/brand-keys";
import type {
  DeviceVaultKeyEnvelope,
  DeviceVaultKeyEnvelopeContext,
} from "../../domain/snapshot/key-slot";
import type {
  DeviceSyncCredentialEncryptionContext,
  DeviceSyncCredentialState,
  EncryptedDeviceSyncCredentialState,
} from "../../domain/sync/device-sync-credential-state";
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
  generateDeviceVaultKeyPair: () => Promise<DeviceVaultKeyPair>;
  generateDeviceLocalProtectionKey: () => Promise<DeviceLocalProtectionKey>;
  generateVaultMasterKey: () => Promise<VaultMasterKey>;
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
  deriveDeviceEnrollmentPrivateStateProtectionKey: (
    localRootKey: LocalRootKey,
    salt: RandomBytes,
  ) => Promise<DeviceEnrollmentPrivateStateProtectionKey>;

  // Key wrapping
  wrapLocalKeysPayload: (
    localKeysPayload: LocalKeysPayload,
    protectionKey: ProtectionKeyFor<LocalKeysPayload>,
  ) => Promise<SerializedWrapped<LocalKeysPayload>>;
  unwrapLocalKeysPayload: (
    protectedLocalKeys: SerializedWrapped<LocalKeysPayload>,
    protectionKey: ProtectionKeyFor<LocalKeysPayload>,
  ) => Promise<LocalKeysPayload>;
  wrapDeviceEnrollmentPrivateState: (
    privateState: DeviceEnrollmentPrivateState,
    protectionKey: DeviceEnrollmentPrivateStateProtectionKey,
  ) => Promise<SerializedWrapped<DeviceEnrollmentPrivateState>>;
  unwrapDeviceEnrollmentPrivateState: (
    protectedPrivateState: SerializedWrapped<DeviceEnrollmentPrivateState>,
    protectionKey: DeviceEnrollmentPrivateStateProtectionKey,
  ) => Promise<DeviceEnrollmentPrivateState>;

  // Recipient-specific vault key envelopes
  createDeviceVaultKeyEnvelope: (
    vaultMasterKey: VaultMasterKey,
    recipientPublicKey: DeviceVaultPublicKey,
    context: DeviceVaultKeyEnvelopeContext,
  ) => Promise<DeviceVaultKeyEnvelope>;
  openDeviceVaultKeyEnvelope: (
    envelope: DeviceVaultKeyEnvelope,
    recipientPrivateKey: DeviceVaultPrivateKey,
    context: DeviceVaultKeyEnvelopeContext,
  ) => Promise<VaultMasterKey>;
  digestDevicePublicSignKey: (
    publicSignKey: DevicePublicSignKey,
  ) => Promise<string>;
  digestDevicePublicVaultKey: (
    publicVaultKey: DeviceVaultPublicKey,
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
  verifyDeviceVaultKeyPair: (
    publicKey: DeviceVaultPublicKey,
    privateKey: DeviceVaultPrivateKey,
  ) => Promise<boolean>;

  // Vault trust
  digestVaultTrustCertificate: (
    certificate: VaultTrustCertificate,
  ) => Promise<string>;
  signVaultTrustCertificate: (
    payload: VaultTrustCertificatePayload,
    privateKey: DevicePrivateSignKey,
  ) => Promise<SerializedSignatureOf<VaultTrustCertificatePayload>>;
  verifyVaultTrustCertificateSignature: (
    certificate: VaultTrustCertificate,
    publicKey: DevicePublicSignKey,
  ) => Promise<boolean>;
  digestVaultSnapshot: (snapshot: VaultSnapshot) => Promise<string>;
  signLocalVaultTrustCheckpoint: (
    payload: LocalVaultTrustCheckpointPayload,
    privateKey: DevicePrivateSignKey,
  ) => Promise<SerializedSignatureOf<LocalVaultTrustCheckpointPayload>>;
  verifyLocalVaultTrustCheckpointSignature: (
    checkpoint: LocalVaultTrustCheckpoint,
    publicKey: DevicePublicSignKey,
  ) => Promise<boolean>;

  // Device enrollment
  signDeviceEnrollmentRequest: (
    request: DeviceEnrollmentRequestPayload,
    privateKey: DevicePrivateSignKey,
  ) => Promise<SerializedSignatureOf<DeviceEnrollmentRequestPayload>>;
  verifyDeviceEnrollmentRequestSignature: (
    request: DeviceEnrollmentRequest,
  ) => Promise<boolean>;

  // Local sync credential protection
  encryptDeviceSyncCredentialState: (
    state: DeviceSyncCredentialState,
    protectionKey: DeviceLocalProtectionKey,
    context: DeviceSyncCredentialEncryptionContext,
  ) => Promise<EncryptedDeviceSyncCredentialState>;
  decryptDeviceSyncCredentialState: (
    encryptedState: EncryptedDeviceSyncCredentialState,
    protectionKey: DeviceLocalProtectionKey,
    context: DeviceSyncCredentialEncryptionContext,
  ) => Promise<DeviceSyncCredentialState>;
}
