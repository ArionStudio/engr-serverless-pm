import type {
  DeviceAgreementPrivateKey,
  DeviceAgreementPublicKey,
  DeviceSigningPrivateKey,
  DeviceSigningPublicKey,
  MasterKEK,
  SlotKEK,
  VaultKey,
} from "./crypto-keys.type";

export function asMasterKEK(key: CryptoKey): MasterKEK {
  return key as MasterKEK;
}

export function asVaultKey(key: CryptoKey): VaultKey {
  return key as VaultKey;
}

export function asSlotKEK(key: CryptoKey): SlotKEK {
  return key as SlotKEK;
}

export function asDeviceSigningPrivateKey(
  key: CryptoKey,
): DeviceSigningPrivateKey {
  return key as DeviceSigningPrivateKey;
}

export function asDeviceSigningPublicKey(
  key: CryptoKey,
): DeviceSigningPublicKey {
  return key as DeviceSigningPublicKey;
}

export function asDeviceAgreementPrivateKey(
  key: CryptoKey,
): DeviceAgreementPrivateKey {
  return key as DeviceAgreementPrivateKey;
}

export function asDeviceAgreementPublicKey(
  key: CryptoKey,
): DeviceAgreementPublicKey {
  return key as DeviceAgreementPublicKey;
}
