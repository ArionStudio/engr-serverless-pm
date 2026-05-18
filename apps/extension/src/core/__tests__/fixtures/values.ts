import type { RandomBytes } from "../../domain/crypto/brand-keys";
import type {
  ProtectionKeyFor,
  SerializedEncrypted,
  SerializedSignatureOf,
  SerializedWrapped,
} from "../../domain/crypto/protected-artifact";
import type {
  DevicePrivateSignKey,
  DevicePublicSignKey,
  DeviceSlotKey,
} from "../../domain/device/brand-keys";
import type {
  LocalKeysPayload,
  LocalRootKey,
} from "../../domain/local-protection/local-protection.type";
import type { RawMasterPassword } from "../../domain/master-password";
import type { RecoveryKeyMnemonic } from "../../domain/recovery/bip39-mnemonic";
import type { RecoverySecretKey } from "../../domain/recovery/brand-keys";
import type { VaultMasterKey } from "../../domain/snapshot/brand-keys";
import type { UnsignedVaultSnapshot } from "../../domain/snapshot/vault-snapshot";
import type { Vault } from "../../domain/vault/vault";

export const bytes = <T extends ArrayBuffer>() => new ArrayBuffer(1) as T;
export const b64 = (value: string) => value as Base64URLString;

export type CoreTestValues = ReturnType<typeof createCoreTestValues>;

export function createCoreTestValues() {
  return {
    masterPassword: "master-password" as RawMasterPassword,
    newMasterPassword: "new-master-password" as RawMasterPassword,
    vaultId: "vault-id",
    vaultDisplayName: "blue-river-4821",
    deviceId: "device-id",
    timestamp: 1_700_000_000_000,
    vaultMasterKey: bytes<VaultMasterKey>(),
    deviceSlotKey: bytes<DeviceSlotKey>(),
    devicePublicSignKey: bytes<DevicePublicSignKey>(),
    devicePrivateSignKey: bytes<DevicePrivateSignKey>(),
    recoverySecretKey: bytes<RecoverySecretKey>(),
    recoveryMnemonicKey: {
      format: "BIP39",
      words: ["abandon", "ability", "able"],
    } satisfies RecoveryKeyMnemonic,
    masterPasswordSalt: bytes<RandomBytes>(),
    localRootKey: bytes<LocalRootKey>(),
    localKeysProtectionSalt: bytes<RandomBytes>(),
    localKeysProtectionKey: bytes<ProtectionKeyFor<LocalKeysPayload>>(),
    deviceSlotVaultMasterKeyProtectionKey:
      bytes<ProtectionKeyFor<VaultMasterKey>>(),
    recoveryVaultMasterKeyProtectionKey:
      bytes<ProtectionKeyFor<VaultMasterKey>>(),
    protectedLocalKeys: {
      wrappedKey: b64("protected-local-keys"),
      wrappingNonce: b64("protected-local-keys-nonce"),
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
    protectedRecoveryVaultMasterKey: {
      wrappedKey: b64("protected-recovery-vault-master-key"),
      wrappingNonce: b64("protected-recovery-vault-master-key-nonce"),
    } satisfies SerializedWrapped<VaultMasterKey>,
    encryptedVault: {
      ciphertext: b64("encrypted-vault"),
      encryptionNonce: b64("encrypted-vault-nonce"),
    } satisfies SerializedEncrypted<Vault>,
    decryptedVault: {
      entries: [],
      registeredDevices: [],
      tags: [],
    } satisfies Vault,
    snapshotSignature: {
      signature: b64("snapshot-signature"),
    } satisfies SerializedSignatureOf<UnsignedVaultSnapshot>,
  };
}
