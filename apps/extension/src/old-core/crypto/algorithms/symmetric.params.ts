import type { SymmetricEncryptionAlgorithm } from "./symmetric.type";

/**
 * Build WebCrypto encrypt/decrypt parameters for the configured symmetric
 * encryption algorithm.
 *
 * This converts your strongly-typed algorithm definition into the exact params
 * object expected by WebCrypto. For AEAD algorithms (e.g. AES-GCM), this also
 * attaches the optional AAD when provided.
 *
 * Why this exists:
 * - Keeps `SymmetricEncryptionAlgorithm` as data-only.
 * - Centralizes mapping to WebCrypto runtime parameter shapes.
 * - Avoids "helper methods" living inside the suite config objects.
 *
 * @param alg - Symmetric encryption algorithm definition from your crypto suite
 * @param iv - Per-encryption nonce/IV bytes. Must be unique per key.
 * @param aad - Optional additional authenticated data.
 * @returns WebCrypto params for `crypto.subtle.encrypt(...)` / `decrypt(...)`
 *
 * @throws Never throws for supported algorithms. Will become exhaustive when you
 * widen `SymmetricEncryptionAlgorithm` union.
 */
export function buildSymmetricParams(
  alg: SymmetricEncryptionAlgorithm,
  iv: BufferSource,
  aad?: BufferSource,
): AesGcmParams {
  switch (alg.kind) {
    case "Aes256GcmSymmetricEncryptionAlgorithm": {
      const params: AesGcmParams = {
        name: "AES-GCM",
        iv,
        tagLength: alg.tagLengthBits,
      };

      if (aad) {
        params.additionalData = aad;
      }

      return params;
    }
  }
}
