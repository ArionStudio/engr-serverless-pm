import type { RandomBytes } from "../../domain/crypto/brand-keys";
import type {
  ProtectionKeyFor,
  SerializedEncrypted,
  SerializedSignatureOf,
  SerializedWrapped,
} from "../../domain/crypto/protected-artifact";
import type {
  DeviceEnrollmentPrivateState,
  DeviceEnrollmentRequest,
  DeviceEnrollmentRequestPayload,
  DeviceLocalProtectionKey,
  DevicePrivateSignKey,
  DevicePublicSignKey,
  DeviceVaultPrivateKey,
  DeviceVaultPublicKey,
  LocalKeysPayload,
  LocalRootKey,
  LocalVaultTrustAnchor,
  LocalVaultTrustCheckpoint,
  LocalVaultTrustCheckpointPayload,
  VaultTrustCertificate,
  VaultTrustCertificatePayload,
  VaultTrustChain,
  VerifiedVaultTrustState,
} from "../../domain/device-trust";
import type { RawMasterPassword } from "../../domain/master-password";
import type { RecoveryKeyMnemonic } from "../../domain/recovery/bip39-mnemonic";
import type { RecoverySecretKey } from "../../domain/recovery/brand-keys";
import type { UnlockedVaultSessionPayloadKey } from "../../domain/session";
import type {
  DeviceSyncCredentialState,
  EncryptedDeviceSyncCredentialState,
  SyncAccess,
  SyncCredentials,
  SyncSetupInput,
  SyncTarget,
} from "../../domain/sync";
import type {
  DeviceVaultKeyEnvelope,
  UnsignedVaultSnapshot,
  VaultMasterKey,
} from "../../domain/snapshot";
import type { Vault } from "../../domain/vault/vault";
import type { Base64URLString } from "../../lib/base64Url.type";

export const bytes = <T extends ArrayBuffer>() => new ArrayBuffer(1) as T;
export const b64 = (value: string) => value as Base64URLString;

export type CoreTestValues = ReturnType<typeof createCoreTestValues>;

export function createCoreTestValues() {
  const devicePublicSignKey = bytes<DevicePublicSignKey>();
  const devicePrivateSignKey = bytes<DevicePrivateSignKey>();
  const devicePublicVaultKey = bytes<DeviceVaultPublicKey>();
  const devicePrivateVaultKey = bytes<DeviceVaultPrivateKey>();
  const deviceLocalProtectionKey = bytes<DeviceLocalProtectionKey>();
  const pendingDevicePublicSignKey = bytes<DevicePublicSignKey>();
  const pendingDevicePrivateSignKey = bytes<DevicePrivateSignKey>();
  const pendingDevicePublicVaultKey = bytes<DeviceVaultPublicKey>();
  const pendingDevicePrivateVaultKey = bytes<DeviceVaultPrivateKey>();
  const pendingDeviceLocalProtectionKey = bytes<DeviceLocalProtectionKey>();
  const vaultTrustCertificatePayload = {
    version: 1,
    vaultId: "vault-id",
    generation: 0,
    vaultKeyGeneration: 1,
    previousCertificateDigest: null,
    authorizedByDeviceId: "device-id",
    trustedDevices: [
      {
        deviceId: "device-id",
        publicSignKey: devicePublicSignKey,
        publicVaultKey: devicePublicVaultKey,
      },
    ],
  } as const satisfies VaultTrustCertificatePayload;
  const vaultTrustCertificateSignature = {
    signature: b64("vault-trust-certificate-signature"),
  } satisfies SerializedSignatureOf<VaultTrustCertificatePayload>;
  const vaultTrustCertificate = {
    payload: vaultTrustCertificatePayload,
    signature: vaultTrustCertificateSignature,
  } satisfies VaultTrustCertificate;
  const vaultTrustCertificateDigest = "vault-trust-certificate-digest";
  const vaultTrustChain = {
    certificates: [vaultTrustCertificate],
  } satisfies VaultTrustChain;
  const vaultTrustAnchor = {
    version: 1,
    vaultId: "vault-id",
    genesisDeviceId: "device-id",
    genesisPublicSignKey: devicePublicSignKey,
    genesisCertificateDigest: vaultTrustCertificateDigest,
  } satisfies LocalVaultTrustAnchor;
  const verifiedVaultTrustState = {
    generation: 0,
    vaultKeyGeneration: 1,
    certificateDigest: vaultTrustCertificateDigest,
    trustedDevices: vaultTrustCertificatePayload.trustedDevices,
  } satisfies VerifiedVaultTrustState;
  const localVaultTrustCheckpointPayload = {
    version: 1,
    vaultId: "vault-id",
    deviceId: "device-id",
    trustGeneration: 0,
    trustCertificateDigest: vaultTrustCertificateDigest,
    vaultKeyGeneration: 1,
    snapshotVersionVector: { "device-id": 1 },
    snapshotDigest: "vault-snapshot-digest",
  } as const satisfies LocalVaultTrustCheckpointPayload;
  const localVaultTrustCheckpoint = {
    payload: localVaultTrustCheckpointPayload,
    signature: {
      signature: b64("local-vault-trust-checkpoint-signature"),
    },
  } satisfies LocalVaultTrustCheckpoint;
  const syncTarget = {
    provider: "aws-s3-v1",
    targetConfig: {
      bucket: "bucket",
      region: "eu-central-1",
      prefix: "vaults",
    },
  } satisfies SyncTarget;
  const syncCredentials = {
    provider: "aws-s3-v1",
    credentialsConfig: {
      accessKeyId: "local-test-access-key",
      secretAccessKey: "local-test-secret-key",
    },
  } satisfies SyncCredentials;
  const replacementSyncCredentials = {
    provider: "aws-s3-v1",
    credentialsConfig: {
      accessKeyId: "replacement-local-test-access-key",
      secretAccessKey: "replacement-local-test-secret-key",
    },
  } satisfies SyncCredentials;
  const syncAccess = {
    target: syncTarget,
    credentials: syncCredentials,
  } satisfies SyncAccess;
  const replacementSyncAccess = {
    target: syncTarget,
    credentials: replacementSyncCredentials,
  } satisfies SyncAccess;
  const syncConfigInput = {
    provider: "aws-s3-v1",
    providerConfig: {
      target: syncTarget.targetConfig,
      credentials: syncCredentials.credentialsConfig,
    },
  } satisfies SyncSetupInput;
  const replacementSyncConfigInput = {
    provider: "aws-s3-v1",
    providerConfig: {
      target: syncTarget.targetConfig,
      credentials: replacementSyncCredentials.credentialsConfig,
    },
  } satisfies SyncSetupInput;
  const vaultKeyEnvelope = {
    recipientDeviceId: "device-id",
    vaultKeyGeneration: 1,
    ephemeralPublicKey: bytes<DeviceVaultPublicKey>(),
    hkdfSalt: bytes<RandomBytes>(),
    encryptedVaultMasterKey: {
      ciphertext: b64("encrypted-vault-master-key"),
      encryptionNonce: b64("vault-key-envelope-nonce"),
    },
  } satisfies DeviceVaultKeyEnvelope;
  const pendingDeviceVaultKeyEnvelope = {
    recipientDeviceId: "pending-device-id",
    vaultKeyGeneration: 1,
    ephemeralPublicKey: bytes<DeviceVaultPublicKey>(),
    hkdfSalt: bytes<RandomBytes>(),
    encryptedVaultMasterKey: {
      ciphertext: b64("encrypted-pending-vault-master-key"),
      encryptionNonce: b64("pending-vault-key-envelope-nonce"),
    },
  } satisfies DeviceVaultKeyEnvelope;
  const encryptedDeviceSyncCredentialState = {
    ciphertext: b64("encrypted-device-sync-credential-state"),
    encryptionNonce: b64("device-sync-credential-state-nonce"),
  } satisfies EncryptedDeviceSyncCredentialState;
  const replacementEncryptedDeviceSyncCredentialState = {
    ciphertext: b64("replacement-encrypted-device-sync-credential-state"),
    encryptionNonce: b64("replacement-device-sync-credential-state-nonce"),
  } satisfies EncryptedDeviceSyncCredentialState;
  const deviceSyncCredentialState = {
    currentCredentials: syncCredentials,
  } satisfies DeviceSyncCredentialState;
  const enrollmentRequestPayload = {
    version: 1,
    requestId: "enrollment-request-id",
    vaultId: "vault-id",
    expectedGenesisCertificateDigest: vaultTrustCertificateDigest,
    deviceId: "pending-device-id",
    algorithmSuiteId: "spm-v1",
    publicSignKey: pendingDevicePublicSignKey,
    publicVaultKey: pendingDevicePublicVaultKey,
  } as const satisfies DeviceEnrollmentRequestPayload;
  const enrollmentRequest = {
    payload: enrollmentRequestPayload,
    signature: {
      signature: b64("enrollment-request-signature"),
    },
  } satisfies DeviceEnrollmentRequest;
  const pendingDeviceEnrollmentPrivateState = {
    request: enrollmentRequest,
    devicePrivateSignKey: pendingDevicePrivateSignKey,
    devicePrivateVaultKey: pendingDevicePrivateVaultKey,
    deviceLocalProtectionKey: pendingDeviceLocalProtectionKey,
  } satisfies DeviceEnrollmentPrivateState;

  return {
    masterPassword: "master-password" as RawMasterPassword,
    newMasterPassword: "new-master-password" as RawMasterPassword,
    vaultId: "vault-id",
    sessionId: "session-id",
    vaultLockActionId: "vault-lock-action-id",
    vaultDisplayName: "blue-river-4821",
    deviceId: "device-id",
    enrollmentId: "enrollment-id",
    requestId: "enrollment-request-id",
    pendingDeviceId: "pending-device-id",
    syncTarget,
    syncCredentials,
    replacementSyncCredentials,
    syncAccess,
    replacementSyncAccess,
    syncConfigInput,
    replacementSyncConfigInput,
    timestamp: 1_700_000_000_000,
    vaultKeyGeneration: 1,
    vaultMasterKey: bytes<VaultMasterKey>(),
    rotatedVaultMasterKey: bytes<VaultMasterKey>(),
    devicePublicSignKey,
    devicePrivateSignKey,
    devicePublicVaultKey,
    devicePrivateVaultKey,
    deviceLocalProtectionKey,
    pendingDevicePublicSignKey,
    pendingDevicePublicSignKeyDigest: "pending-device-public-sign-key-digest",
    devicePublicSignKeyDigest: "device-public-sign-key-digest",
    pendingDevicePrivateSignKey,
    pendingDevicePublicVaultKey,
    pendingDevicePrivateVaultKey,
    pendingDeviceLocalProtectionKey,
    vaultKeyEnvelope,
    pendingDeviceVaultKeyEnvelope,
    enrollmentRequestPayload,
    enrollmentRequest,
    pendingDeviceEnrollmentPrivateState,
    vaultTrustCertificatePayload,
    vaultTrustCertificateSignature,
    vaultTrustCertificate,
    vaultTrustCertificateDigest,
    vaultTrustChain,
    vaultTrustAnchor,
    verifiedVaultTrustState,
    localVaultTrustCheckpointPayload,
    localVaultTrustCheckpoint,
    vaultSnapshotDigest: "vault-snapshot-digest",
    recoverySecretKey: bytes<RecoverySecretKey>(),
    rotatedRecoverySecretKey: bytes<RecoverySecretKey>(),
    unlockedVaultSessionPayloadKey: bytes<UnlockedVaultSessionPayloadKey>(),
    recoveryMnemonicKey: {
      format: "BIP39",
      words: ["abandon", "ability", "able"],
    } satisfies RecoveryKeyMnemonic,
    rotatedRecoveryMnemonicKey: {
      format: "BIP39",
      words: ["about", "above", "absent"],
    } satisfies RecoveryKeyMnemonic,
    masterPasswordSalt: bytes<RandomBytes>(),
    localRootKey: bytes<LocalRootKey>(),
    localKeysProtectionSalt: bytes<RandomBytes>(),
    localKeysProtectionKey: bytes<ProtectionKeyFor<LocalKeysPayload>>(),
    pendingEnrollmentProtectionKey:
      bytes<ProtectionKeyFor<DeviceEnrollmentPrivateState>>(),
    recoveryLocalKeysProtectionSalt: bytes<RandomBytes>(),
    recoveryLocalKeysProtectionKey: bytes<ProtectionKeyFor<LocalKeysPayload>>(),
    rotatedRecoveryLocalKeysProtectionSalt: bytes<RandomBytes>(),
    rotatedRecoveryLocalKeysProtectionKey:
      bytes<ProtectionKeyFor<LocalKeysPayload>>(),
    protectedLocalKeys: {
      wrappedKey: b64("protected-local-keys"),
      wrappingNonce: b64("protected-local-keys-nonce"),
    } satisfies SerializedWrapped<LocalKeysPayload>,
    recoveryProtectedLocalKeys: {
      wrappedKey: b64("recovery-protected-local-keys"),
      wrappingNonce: b64("recovery-protected-local-keys-nonce"),
    } satisfies SerializedWrapped<LocalKeysPayload>,
    rotatedRecoveryProtectedLocalKeys: {
      wrappedKey: b64("rotated-recovery-protected-local-keys"),
      wrappingNonce: b64("rotated-recovery-protected-local-keys-nonce"),
    } satisfies SerializedWrapped<LocalKeysPayload>,
    protectedPendingDeviceEnrollment: {
      wrappedKey: b64("protected-pending-device-enrollment"),
      wrappingNonce: b64("protected-pending-device-enrollment-nonce"),
    } satisfies SerializedWrapped<DeviceEnrollmentPrivateState>,
    newMasterPasswordSalt: bytes<RandomBytes>(),
    newLocalRootKey: bytes<LocalRootKey>(),
    newLocalKeysProtectionSalt: bytes<RandomBytes>(),
    newLocalKeysProtectionKey: bytes<ProtectionKeyFor<LocalKeysPayload>>(),
    reprotectedLocalKeys: {
      wrappedKey: b64("reprotected-local-keys"),
      wrappingNonce: b64("reprotected-local-keys-nonce"),
    } satisfies SerializedWrapped<LocalKeysPayload>,
    encryptedVault: {
      ciphertext: b64("encrypted-vault"),
      encryptionNonce: b64("encrypted-vault-nonce"),
    } satisfies SerializedEncrypted<Vault>,
    encryptedUnlockedVaultSessionPayload: {
      ciphertext: b64("encrypted-unlocked-vault-session-payload"),
      encryptionNonce: b64("encrypted-unlocked-vault-session-payload-nonce"),
    } satisfies SerializedEncrypted<{ readonly vault: Vault }>,
    encryptedDeviceSyncCredentialState,
    replacementEncryptedDeviceSyncCredentialState,
    deviceSyncCredentialState,
    decryptedVault: {
      versionVector: { "device-id": 1 },
      entries: [],
      deletedEntries: [],
      deviceProfiles: [],
      deletedDeviceProfiles: [],
      tags: [],
      deletedTags: [],
    } satisfies Vault,
    snapshotSignature: {
      signature: b64("snapshot-signature"),
    } satisfies SerializedSignatureOf<UnsignedVaultSnapshot>,
    enrollmentRequestSignature: {
      signature: b64("enrollment-request-signature"),
    } satisfies SerializedSignatureOf<DeviceEnrollmentRequestPayload>,
  };
}
