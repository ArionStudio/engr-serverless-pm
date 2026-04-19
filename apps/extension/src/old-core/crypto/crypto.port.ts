/**
 * Crypto service port interface.
 *
 * Defines the contract for cryptographic operations.
 * Implementations must use WebCrypto API.
 *
 * Uses `CryptoProfile` to select:
 * - algorithm suite (kdf/symmetric/wrap/etc.)
 * - serialization suite (when higher-level ports need it)
 *
 * Payload design:
 * - `EncryptedDataPayload` is intentionally algorithm-agnostic. The selected
 *   algorithms come from the resolved profile/suite in surrounding metadata.
 *
 * @see docs/security/security-specification.md
 */

import type { EncryptedDataPayload } from "../vault/encrypted-payload.type";
import type { MasterKEK, VaultKey } from "./keys/crypto-keys.type";
import type { CryptoProfile } from "./profiles/crypto-profile.type";
import type { KeyFormat } from "./formats/key-format.type";

/**
 * Result of key derivation operation.
 */
export interface KeyDerivationResult {
  /**
   * Derived master key encryption key (KEK).
   *
   * Security requirement:
   * - MUST be non-extractable.
   */
  readonly masterKEK: MasterKEK;

  /**
   * Salt used for derivation (returned for persistence).
   */
  readonly salt: BufferSource;
}

/**
 * Crypto service port interface.
 *
 * Core layer defines the interface; adapters provide WebCrypto implementation.
 */
export interface CryptoPort {
  /**
   * Derive MasterKEK from password using the profile-selected KDF.
   *
   * Input is pre-processed: SHA-256(password + pepper)
   *
   * @param profile - Crypto profile selecting algorithm + serialization suites
   * @param password - Pre-processed password bytes
   * @param salt - Random salt (32 bytes minimum)
   * @returns Derived MasterKEK (non-extractable) + salt used
   */
  deriveKey(
    profile: CryptoProfile,
    password: BufferSource,
    salt: BufferSource,
  ): Promise<KeyDerivationResult>;

  /**
   * Generate a new random vault key (DEK).
   *
   * @param profile - Crypto profile selecting algorithm + serialization suites
   * @returns New VaultKey
   *
   * Security note:
   * - If you plan to wrap it using `wrapKey("raw", ...)`, WebCrypto requires the
   *   key being wrapped to be extractable.
   */
  generateVaultKey(profile: CryptoProfile): Promise<VaultKey>;

  /**
   * Encrypt data with a vault key using the profile-selected symmetric algorithm.
   *
   * @param profile - Crypto profile selecting algorithm + serialization suites
   * @param data - Plaintext bytes to encrypt
   * @param key - Vault key for encryption
   * @param aad - Optional additional authenticated data
   * @returns Encrypted data payload (nonce + ciphertext)
   */
  encrypt(
    profile: CryptoProfile,
    data: BufferSource,
    key: VaultKey,
    aad?: BufferSource,
  ): Promise<EncryptedDataPayload>;

  /**
   * Decrypt data with a vault key using the profile-selected symmetric algorithm.
   *
   * @param profile - Crypto profile selecting algorithm + serialization suites
   * @param payload - Encrypted data payload (nonce + ciphertext)
   * @param key - Vault key for decryption
   * @param aad - Optional additional authenticated data (must match encryption)
   * @returns Decrypted plaintext bytes
   *
   * @throws If decryption fails (tampered data, wrong key, wrong AAD, etc.)
   */
  decrypt(
    profile: CryptoProfile,
    payload: EncryptedDataPayload,
    key: VaultKey,
    aad?: BufferSource,
  ): Promise<ArrayBuffer>;

  /**
   * Generate cryptographically secure random salt.
   *
   * @param length - Salt length in bytes (default: 32)
   * @returns Random salt bytes
   */
  generateSalt(length?: number): ArrayBuffer;

  /**
   * Generate cryptographically secure random IV.
   *
   * @returns Random IV (12 bytes for AES-GCM)
   */
  generateIV(): ArrayBuffer;

  /**
   * Compute hash of data using the profile-selected hash algorithm.
   *
   * @param profile - Crypto profile selecting algorithm + serialization suites
   * @param data - Data to hash
   * @returns Hash digest bytes
   */
  hash(profile: CryptoProfile, data: BufferSource): Promise<ArrayBuffer>;

  /**
   * Wrap a key with another key using the profile-selected key wrap algorithm.
   *
   * This is used for:
   * - wrapping the vault key by device KEK / secret KEK
   * - wrapping device private keys (typically "pkcs8")
   *
   * @param profile - Crypto profile selecting algorithm + serialization suites
   * @param format - WebCrypto key serialization format for the wrapped key
   * @param keyToWrap - Key to wrap (must be extractable for chosen format)
   * @param wrappingKey - Key encryption key (KEK) used to wrap
   * @returns Wrapped key bytes
   */
  wrapKey(
    profile: CryptoProfile,
    format: KeyFormat,
    keyToWrap: CryptoKey,
    wrappingKey: CryptoKey,
  ): Promise<ArrayBuffer>;

  /**
   * Unwrap a key using the profile-selected key wrap algorithm.
   *
   * @param profile - Crypto profile selecting algorithm + serialization suites
   * @param format - WebCrypto key serialization format of the wrapped key bytes
   * @param wrappedKey - Wrapped key bytes
   * @param unwrappingKey - Key encryption key (KEK) used to unwrap
   * @param algorithm - Algorithm descriptor for the unwrapped key
   * @param extractable - Whether unwrapped key should be extractable
   * @param keyUsages - Allowed usages for the unwrapped key
   * @returns Unwrapped CryptoKey
   */
  unwrapKey(
    profile: CryptoProfile,
    format: KeyFormat,
    wrappedKey: ArrayBuffer,
    unwrappingKey: CryptoKey,
    algorithm: AlgorithmIdentifier,
    extractable: boolean,
    keyUsages: KeyUsage[],
  ): Promise<CryptoKey>;
}
