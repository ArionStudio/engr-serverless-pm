/**
 * Crypto service port interface.
 *
 * Defines the contract for cryptographic operations.
 * Implementations must use WebCrypto API.
 *
 * @see docs/security/security-specification.md
 */

import type { MasterKEK, VaultKey } from "./crypto.type";
import type { EncryptedDataPayload } from "../vault/encrypted-data.type";

/**
 * Result of key derivation operation.
 */
export interface KeyDerivationResult {
  /** Derived master key encryption key */
  readonly masterKEK: MasterKEK;
  /** Salt used (returned for storage) */
  readonly salt: Uint8Array;
}

/**
 * Crypto service port interface.
 *
 * Core layer defines the interface; adapters provide WebCrypto implementation.
 */
export interface ICryptoService {
  /**
   * Derive MasterKEK from password using PBKDF2.
   *
   * Input is pre-processed: SHA256(password + pepper)
   *
   * @param password - Pre-processed password bytes
   * @param salt - Random salt (32 bytes minimum)
   * @returns Derived MasterKEK (non-extractable)
   */
  deriveKey(password: Uint8Array, salt: Uint8Array): Promise<MasterKEK>;

  /**
   * Generate a new random vault key.
   *
   * @returns New VaultKey (non-extractable)
   */
  generateVaultKey(): Promise<VaultKey>;

  /**
   * Encrypt data with vault key using AES-256-GCM.
   *
   * @param data - Plaintext bytes to encrypt
   * @param key - Vault key for encryption
   * @param aad - Optional additional authenticated data
   * @returns Encrypted data payload with IV
   */
  encrypt(
    data: Uint8Array,
    key: VaultKey,
    aad?: Uint8Array,
  ): Promise<EncryptedDataPayload>;

  /**
   * Decrypt data with vault key using AES-256-GCM.
   *
   * @param payload - Encrypted data payload
   * @param key - Vault key for decryption
   * @param aad - Optional additional authenticated data (must match encryption)
   * @returns Decrypted plaintext bytes
   * @throws If decryption fails (tampered data or wrong key)
   */
  decrypt(
    payload: EncryptedDataPayload,
    key: VaultKey,
    aad?: Uint8Array,
  ): Promise<Uint8Array>;

  /**
   * Generate cryptographically secure random salt.
   *
   * @param length - Salt length in bytes (default: 32)
   * @returns Random salt bytes
   */
  generateSalt(length?: number): Uint8Array;

  /**
   * Generate cryptographically secure random IV.
   *
   * @returns Random IV (12 bytes for AES-GCM)
   */
  generateIV(): Uint8Array;

  /**
   * Compute SHA-256 hash of data.
   *
   * @param data - Data to hash
   * @returns Hash digest bytes
   */
  hash(data: Uint8Array): Promise<Uint8Array>;

  /**
   * Wrap a key with another key using AES-KW.
   *
   * @param keyToWrap - Key to wrap
   * @param wrappingKey - Key to wrap with
   * @returns Wrapped key bytes
   */
  wrapKey(keyToWrap: CryptoKey, wrappingKey: CryptoKey): Promise<Uint8Array>;

  /**
   * Unwrap a key using AES-KW.
   *
   * @param wrappedKey - Wrapped key bytes
   * @param unwrappingKey - Key to unwrap with
   * @param algorithm - Algorithm for unwrapped key
   * @param extractable - Whether unwrapped key should be extractable
   * @param keyUsages - Allowed usages for unwrapped key
   * @returns Unwrapped CryptoKey
   */
  unwrapKey(
    wrappedKey: Uint8Array,
    unwrappingKey: CryptoKey,
    algorithm: AlgorithmIdentifier,
    extractable: boolean,
    keyUsages: KeyUsage[],
  ): Promise<CryptoKey>;
}
