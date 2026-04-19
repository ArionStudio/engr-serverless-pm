/**
 * Encrypted data payload types.
 *
 * Minimal encrypted payload used by the vault.
 *
 * This payload is intentionally algorithm-agnostic:
 * - It stores only per-encryption values that cannot be derived elsewhere.
 * - The crypto profile (algorithms + serialization rules), key selection, and
 *   any additional authenticated data (AAD) are provided by surrounding
 *   metadata (e.g. vault metadata, key-slot/envelope info, record context).
 *
 * Design intent:
 * - Keep stored records small and avoid duplicating suite/profile configuration.
 * - Avoid conflicting sources of truth (payload vs metadata/profile).
 */

import type { Base64UrlBytes } from "./key-slot.type";

/**
 * AES-GCM nonce (12 bytes, base64url encoded).
 *
 * Self-documenting type alias for nonce fields.
 * MUST be unique per encryption with the same key.
 */
export type AesGcmNonce = Base64UrlBytes;

/**
 * Minimal encrypted payload.
 *
 * Semantics:
 * - `nonce` is the per-encryption nonce/IV. It MUST be unique for a given key.
 *   Required size/format depends on the selected algorithm suite.
 * - `ciphertext` is the encrypted bytes. It may include an authentication tag
 *   if the selected algorithm is an AEAD mode (e.g. AES-GCM).
 */
export interface EncryptedDataPayload {
  /**
   * base64url encoded nonce/IV (length depends on the selected suite).
   */
  readonly nonce: AesGcmNonce;

  /**
   * base64url encoded ciphertext.
   *
   * For AEAD algorithms, this includes the authentication tag as produced by
   * the crypto implementation.
   */
  readonly ciphertext: Base64UrlBytes;
}
