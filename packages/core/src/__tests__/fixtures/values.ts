import type { RandomBytes } from "../../domain/crypto/brand-keys";
import type { Base64URLString } from "../../lib/base64Url.type";
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
  DeviceSlotKey,
} from "../../domain/device-trust/brand-keys";
import type {
  LocalKeysPayload,
  LocalRootKey,
} from "../../domain/device-trust/local-protection.type";
import type { RawMasterPassword } from "../../domain/master-password";
import type { RecoveryKeyMnemonic } from "../../domain/recovery/bip39-mnemonic";
import type { RecoverySecretKey } from "../../domain/recovery/brand-keys";
import type { VaultMasterKey } from "../../domain/snapshot/brand-keys";
import type { SyncConfig } from "../../domain/sync/sync-config.type";
import type { DeviceEnrollmentAuthorizationPayload } from "../../domain/device-trust/device-enrollment-authorization";
import type { UnsignedVaultSnapshot } from "../../domain/snapshot/vault-snapshot";
import type { UnlockedVaultSessionPayloadKey } from "../../domain/session/unlocked-vault-session-payload-key";
import type { Vault } from "../../domain/vault/vault";

export const bytes = <T extends ArrayBuffer>() => new ArrayBuffer(1) as T;
export const b64 = (value: string) => value as Base64URLString;

export type CoreTestValues = ReturnType<typeof createCoreTestValues>;

export function createCoreTestValues() {
  return {
    masterPassword: "master-password" as RawMasterPassword,
    newMasterPassword: "new-master-password" as RawMasterPassword,
    vaultId: "vault-id",
    sessionId: "session-id",
    vaultLockActionId: "vault-lock-action-id",
    vaultDisplayName: "blue-river-4821",
    deviceId: "device-id",
    enrollmentId: "enrollment-id",
    pendingDeviceId: "pending-device-id",
    syncConfig: {
      provider: "aws-s3-v1",
      providerConfig: {
        normalized: true,
      },
    } satisfies SyncConfig,
    syncConfigInput: {
      provider: "aws-s3-v1",
      providerConfig: {
        bucket: "bucket",
        region: "eu-central-1",
      },
    } satisfies SyncConfig,
    timestamp: 1_700_000_000_000,
    vaultMasterKey: bytes<VaultMasterKey>(),
    deviceSlotKey: bytes<DeviceSlotKey>(),
    deviceEnrollmentSecret: bytes<DeviceEnrollmentSecret>(),
    devicePublicSignKey: bytes<DevicePublicSignKey>(),
    devicePrivateSignKey: bytes<DevicePrivateSignKey>(),
    pendingDevicePublicSignKey: bytes<DevicePublicSignKey>(),
    pendingDevicePrivateSignKey: bytes<DevicePrivateSignKey>(),
    pendingDevicePublicSignKeyDigest: "pending-device-public-sign-key-digest",
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
    recoveryLocalKeysProtectionSalt: bytes<RandomBytes>(),
    recoveryLocalKeysProtectionKey: bytes<ProtectionKeyFor<LocalKeysPayload>>(),
    rotatedRecoveryLocalKeysProtectionSalt: bytes<RandomBytes>(),
    rotatedRecoveryLocalKeysProtectionKey:
      bytes<ProtectionKeyFor<LocalKeysPayload>>(),
    deviceSlotVaultMasterKeyProtectionKey:
      bytes<ProtectionKeyFor<VaultMasterKey>>(),
    enrollmentVaultMasterKeyProtectionKey:
      bytes<ProtectionKeyFor<VaultMasterKey>>(),
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
    newMasterPasswordSalt: bytes<RandomBytes>(),
    newLocalRootKey: bytes<LocalRootKey>(),
    newLocalKeysProtectionSalt: bytes<RandomBytes>(),
    newLocalKeysProtectionKey: bytes<ProtectionKeyFor<LocalKeysPayload>>(),
    reprotectedLocalKeys: {
      wrappedKey: b64("reprotected-local-keys"),
      wrappingNonce: b64("reprotected-local-keys-nonce"),
    } satisfies SerializedWrapped<LocalKeysPayload>,
    protectedDeviceVaultMasterKey: {
      wrappedKey: b64("protected-device-vault-master-key"),
      wrappingNonce: b64("protected-device-vault-master-key-nonce"),
    } satisfies SerializedWrapped<VaultMasterKey>,
    protectedEnrollmentVaultMasterKey: {
      wrappedKey: b64("protected-enrollment-vault-master-key"),
      wrappingNonce: b64("protected-enrollment-vault-master-key-nonce"),
    } satisfies SerializedWrapped<VaultMasterKey>,
    protectedEnrollmentVaultMasterKeyDigest:
      "protected-enrollment-vault-master-key-digest",
    encryptedVault: {
      ciphertext: b64("encrypted-vault"),
      encryptionNonce: b64("encrypted-vault-nonce"),
    } satisfies SerializedEncrypted<Vault>,
    encryptedUnlockedVaultSessionPayload: {
      ciphertext: b64("encrypted-unlocked-vault-session-payload"),
      encryptionNonce: b64("encrypted-unlocked-vault-session-payload-nonce"),
    } satisfies SerializedEncrypted<{
      readonly vault: Vault;
    }>,
    decryptedVault: {
      versionVector: {
        "device-id": 1,
      },
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
    deviceEnrollmentAuthorizationSignature: {
      signature: b64("device-enrollment-authorization-signature"),
    } satisfies SerializedSignatureOf<DeviceEnrollmentAuthorizationPayload>,
  };
}
