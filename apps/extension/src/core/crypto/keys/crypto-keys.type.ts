/**
 * Cryptographic key role type definitions.
 *
 * Uses branded types (nominal typing) to prevent key confusion at compile time.
 * WebCrypto enforces actual algorithm/usages/extractability at runtime.
 *
 * Branded types ensure:
 * - MasterKEK cannot be passed where VaultKey is expected (and vice versa)
 * - Device signing keys cannot be confused with agreement keys
 * - Compile-time errors when keys are used in wrong contexts
 *
 * Factory functions (asMasterKEK, asVaultKey, etc.) cast CryptoKey to branded
 * types with zero runtime cost. Use them at the point of key creation.
 */

// === Symmetric Key Brands ===

declare const MasterKEKBrand: unique symbol;
declare const VaultKeyBrand: unique symbol;
declare const SlotKEKBrand: unique symbol;

/**
 * Master Key Encryption Key (KEK).
 *
 * Derived from master password via the configured KDF.
 * Used to wrap/unwrap other keys.
 *
 * Security requirement:
 * - MUST be non-extractable at runtime.
 */
export type MasterKEK = CryptoKey & { readonly [MasterKEKBrand]: true };

/**
 * Vault Key (Data Encryption Key).
 *
 * Used to encrypt/decrypt vault data with AES-GCM.
 *
 * Note:
 * - If you wrap it using `wrapKey("raw", ...)`, WebCrypto requires it to be
 *   extractable.
 */
export type VaultKey = CryptoKey & { readonly [VaultKeyBrand]: true };

/**
 * Slot KEK (Key Encryption Key for device slots).
 *
 * Derived via ECDH key agreement between device agreement key and ephemeral key.
 * Used to wrap/unwrap the VaultKey in device key slots.
 */
export type SlotKEK = CryptoKey & { readonly [SlotKEKBrand]: true };

// === Asymmetric Key Brands ===

declare const SigningPrivateKeyBrand: unique symbol;
declare const SigningPublicKeyBrand: unique symbol;
declare const AgreementPrivateKeyBrand: unique symbol;
declare const AgreementPublicKeyBrand: unique symbol;

/**
 * Device signing private key (e.g., Ed25519).
 *
 * Used to sign vault snapshots for authenticity verification.
 */
export type DeviceSigningPrivateKey = CryptoKey & {
  readonly [SigningPrivateKeyBrand]: true;
};

/**
 * Device signing public key (e.g., Ed25519).
 *
 * Used to verify vault snapshot signatures.
 */
export type DeviceSigningPublicKey = CryptoKey & {
  readonly [SigningPublicKeyBrand]: true;
};

/**
 * Device agreement private key (e.g., ECDH P-256 / X25519).
 *
 * Used in key agreement to derive SlotKEK for vault key distribution.
 */
export type DeviceAgreementPrivateKey = CryptoKey & {
  readonly [AgreementPrivateKeyBrand]: true;
};

/**
 * Device agreement public key (e.g., ECDH P-256 / X25519).
 *
 * Used in key agreement to derive SlotKEK for vault key distribution.
 */
export type DeviceAgreementPublicKey = CryptoKey & {
  readonly [AgreementPublicKeyBrand]: true;
};

// === Typed Key Pairs ===

/**
 * Device signing key pair with branded types.
 */
export type DeviceSigningKeyPair = Readonly<{
  readonly publicKey: DeviceSigningPublicKey;
  readonly privateKey: DeviceSigningPrivateKey;
}>;

/**
 * Device agreement key pair with branded types.
 */
export type DeviceAgreementKeyPair = Readonly<{
  readonly publicKey: DeviceAgreementPublicKey;
  readonly privateKey: DeviceAgreementPrivateKey;
}>;

// === Factory Functions (zero runtime cost) ===

/**
 * Brand a CryptoKey as MasterKEK.
 *
 * Use at the point of key derivation.
 */
export function asMasterKEK(key: CryptoKey): MasterKEK {
  return key as MasterKEK;
}

/**
 * Brand a CryptoKey as VaultKey.
 *
 * Use at the point of key generation or unwrapping.
 */
export function asVaultKey(key: CryptoKey): VaultKey {
  return key as VaultKey;
}

/**
 * Brand a CryptoKey as SlotKEK.
 *
 * Use at the point of key agreement derivation.
 */
export function asSlotKEK(key: CryptoKey): SlotKEK {
  return key as SlotKEK;
}

/**
 * Brand a CryptoKey as DeviceSigningPrivateKey.
 *
 * Use at the point of key generation or unwrapping.
 */
export function asSigningPrivateKey(key: CryptoKey): DeviceSigningPrivateKey {
  return key as DeviceSigningPrivateKey;
}

/**
 * Brand a CryptoKey as DeviceSigningPublicKey.
 *
 * Use at the point of key generation or import.
 */
export function asSigningPublicKey(key: CryptoKey): DeviceSigningPublicKey {
  return key as DeviceSigningPublicKey;
}

/**
 * Brand a CryptoKey as DeviceAgreementPrivateKey.
 *
 * Use at the point of key generation or unwrapping.
 */
export function asAgreementPrivateKey(
  key: CryptoKey,
): DeviceAgreementPrivateKey {
  return key as DeviceAgreementPrivateKey;
}

/**
 * Brand a CryptoKey as DeviceAgreementPublicKey.
 *
 * Use at the point of key generation or import.
 */
export function asAgreementPublicKey(key: CryptoKey): DeviceAgreementPublicKey {
  return key as DeviceAgreementPublicKey;
}
