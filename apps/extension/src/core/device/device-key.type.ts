/**
 * Device key pair types for signing and key exchange.
 *
 * Each device generates two key pairs:
 * 1. Ed25519 for signing (identity verification)
 * 2. ECDH P-256 for key exchange (device key slots)
 *
 * @see docs/security/security-specification.md Section 4
 */

/**
 * Ed25519 signing key pair for device identity.
 * Used to sign vault envelopes for provenance verification.
 */
export interface DeviceSignKeyPair {
  readonly publicKey: CryptoKey;
  /** non-extractable at runtime */
  readonly privateKey: CryptoKey;
}

/**
 * ECDH P-256 key pair for key exchange.
 * Used to create per-device key slots for vault key distribution.
 */
export interface DeviceEcdhKeyPair {
  readonly publicKey: CryptoKey;
  /** non-extractable at runtime */
  readonly privateKey: CryptoKey;
}

export interface DeviceKeyPair {
  readonly signKeyPair: DeviceSignKeyPair;
  readonly ecdhKeyPair: DeviceEcdhKeyPair;
}

export interface WrappedKey {
  readonly wrappedKey: Uint8Array;
  readonly alg: "PBKDF2+AESKW";
  readonly format: "pkcs8";
}

/**
 * Wrapped device private keys for persistent storage.
 * Keys are wrapped with MasterKEK derived from the master password.
 *
 * Stored in IndexedDB - useless without the master password.
 */
export interface WrappedDeviceKeys {
  readonly signKey: WrappedKey;
  readonly ecdhKey: WrappedKey;
}

/**
 * Exportable device public keys in JWK format.
 * Used for device registration and key slot creation.
 */
export interface DevicePublicKeys {
  /** JWK format */
  readonly signKey: JsonWebKey;
  /** JWK format */
  readonly exchangeKey: JsonWebKey;
}
