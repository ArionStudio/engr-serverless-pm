/**
 * Cryptographic key role definitions.
 *
 * These branded types prevent mixing keys that have different security roles.
 * They add no runtime cost and exist only for TypeScript safety.
 */

// Symmetric key role brands
declare const MasterKEKBrand: unique symbol;
declare const VaultKeyBrand: unique symbol;
declare const SlotKEKBrand: unique symbol;

// Asymmetric key role brands
declare const DeviceSigningPrivateKeyBrand: unique symbol;
declare const DeviceSigningPublicKeyBrand: unique symbol;
declare const DeviceAgreementPrivateKeyBrand: unique symbol;
declare const DeviceAgreementPublicKeyBrand: unique symbol;

/**
 * Master Key Encryption Key.
 *
 * Derived from the master password and used to wrap or unwrap device private keys.
 */
export type MasterKEK = CryptoKey & {
  readonly [MasterKEKBrand]: true;
};

/**
 * Vault encryption key.
 *
 * Used to encrypt and decrypt vault data.
 */
export type VaultKey = CryptoKey & {
  readonly [VaultKeyBrand]: true;
};

/**
 * Slot Key Encryption Key.
 *
 * Derived for a specific key slot and used to wrap or unwrap the VaultKey.
 */
export type SlotKEK = CryptoKey & {
  readonly [SlotKEKBrand]: true;
};

/**
 * Device signing private key.
 *
 * Used to sign vault envelopes or snapshots.
 */
export type DeviceSigningPrivateKey = CryptoKey & {
  readonly [DeviceSigningPrivateKeyBrand]: true;
};

/**
 * Device signing public key.
 *
 * Used to verify vault envelope or snapshot signatures.
 */
export type DeviceSigningPublicKey = CryptoKey & {
  readonly [DeviceSigningPublicKeyBrand]: true;
};

/**
 * Device agreement private key.
 *
 * Used for key agreement during slot KEK derivation.
 */
export type DeviceAgreementPrivateKey = CryptoKey & {
  readonly [DeviceAgreementPrivateKeyBrand]: true;
};

/**
 * Device agreement public key.
 *
 * Used for key agreement during slot KEK derivation.
 */
export type DeviceAgreementPublicKey = CryptoKey & {
  readonly [DeviceAgreementPublicKeyBrand]: true;
};

export type DeviceSigningKeyPair = Readonly<{
  readonly publicKey: DeviceSigningPublicKey;
  readonly privateKey: DeviceSigningPrivateKey;
}>;

export type DeviceAgreementKeyPair = Readonly<{
  readonly publicKey: DeviceAgreementPublicKey;
  readonly privateKey: DeviceAgreementPrivateKey;
}>;
