import type { KdfAlgorithm } from "./kdf.type";

/**
 * Build WebCrypto `deriveKey` parameters for a configured KDF algorithm.
 *
 * This converts your strongly-typed domain algorithm definition into the exact
 * parameter object expected by WebCrypto.
 *
 * Why this exists:
 * - Keeps `KdfAlgorithm` as data-only (no methods on suite objects).
 * - Centralizes mapping between your definitions and WebCrypto runtime types.
 * - Makes adapters smaller and consistent.
 *
 * @param kdf - KDF algorithm definition from your crypto suite
 * @param salt - Random salt bytes. Must match the size/requirements of the suite.
 * @returns WebCrypto PBKDF2 parameters for `crypto.subtle.deriveKey(...)`
 *
 * @throws Never throws for supported algorithms. Will become exhaustive when you
 * widen `KdfAlgorithm` union.
 */
export function buildKdfDeriveKeyParams(
  kdf: KdfAlgorithm,
  salt: BufferSource,
): Pbkdf2Params {
  switch (kdf.kind) {
    case "Pbkdf2HmacSha256KdfAlgorithm":
      return {
        name: "PBKDF2",
        salt,
        iterations: kdf.iterations,
        hash: kdf.hash,
      };
  }
}
