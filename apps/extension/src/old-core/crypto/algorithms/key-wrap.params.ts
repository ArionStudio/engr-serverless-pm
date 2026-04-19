import type { KeyWrapAlgorithm } from "./key-wrap.type";

/**
 * Build WebCrypto wrap/unwrap parameters for the configured key wrap algorithm.
 *
 * This converts your strongly-typed algorithm definition into the exact params
 * object expected by WebCrypto.
 *
 * Why this exists:
 * - Keeps `KeyWrapAlgorithm` as data-only.
 * - Centralizes mapping to WebCrypto runtime parameter shapes.
 * - AES-GCM requires a per-operation IV, so params cannot be static on the type.
 *
 * @param alg - Key wrap algorithm definition from your crypto suite
 * @param iv - Per-wrap nonce/IV bytes (12 bytes for AES-GCM). Must be unique per key.
 * @returns WebCrypto params for `crypto.subtle.wrapKey(...)` / `unwrapKey(...)`
 */
export function buildKeyWrapParams(
  alg: KeyWrapAlgorithm,
  iv: BufferSource,
): AesGcmParams {
  switch (alg.kind) {
    case "Aes256GcmKeyWrapAlgorithm":
      return { name: "AES-GCM", iv, tagLength: alg.tagLengthBits };
  }
}
