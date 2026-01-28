/**
 * Cryptographic type definitions for the password manager.
 *
 * @see docs/security/security-specification.md
 */

/**
 * Master Key Encryption Key - derived from master password via PBKDF2.
 * Used to wrap device private keys.
 *
 * Input: SHA256(MasterPassword + ApplicationPepper)
 * Must be non-extractable at runtime.
 */
export type MasterKEK = CryptoKey;

/**
 * Vault Key (Data Encryption Key) - AES-256-GCM key for vault data.
 * Must be non-extractable at runtime.
 */
export type VaultKey = CryptoKey;

/**
 * PBKDF2 key derivation parameters.
 *
 * @see docs/security/security-specification.md Section 3.2
 */
export interface KDFParameters {
  readonly algorithm: "PBKDF2";
  readonly hash: "SHA-256";
  readonly iterations: number;
  readonly salt: Uint8Array;
}

/**
 * AES-256-GCM encryption parameters.
 *
 * @see docs/security/security-specification.md Section 3.3
 */
export interface AESGCMParameters {
  readonly algorithm: "AES-256-GCM";
  readonly ivLengthBytes: 12;
  readonly tagLengthBits: 128;
}
