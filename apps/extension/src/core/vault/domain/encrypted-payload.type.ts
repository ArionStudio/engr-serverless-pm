import type { Base64UrlBytes } from "./key-slot.type";

/**
 * Per-encryption nonce or IV.
 *
 * The required length depends on the active crypto profile.
 */
export type EncryptionNonce = Base64UrlBytes;

/**
 * Minimal encrypted payload stored inside the vault snapshot.
 *
 * The payload is intentionally algorithm-agnostic. The crypto profile defines
 * how `nonce` and `ciphertext` must be interpreted.
 */
export interface EncryptedDataPayload {
  readonly nonce: EncryptionNonce;
  readonly ciphertext: Base64UrlBytes;
}
