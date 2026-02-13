import type { AlgorithmSuite } from "./algorithm-suite.type";
import { buildKdfDeriveKeyParams } from "../algorithms/kdf.params";
import { buildSymmetricParams } from "../algorithms/symmetric.params";

/**
 * Suite-level helper: build KDF parameters for WebCrypto based on the suite.
 *
 * This is a tiny convenience wrapper around `buildKdfDeriveKeyParams` that
 * selects the suite's KDF algorithm.
 *
 * @param suite - Algorithm suite definition
 * @param salt - Random salt bytes
 * @returns WebCrypto PBKDF2 params for `crypto.subtle.deriveKey(...)`
 */
export function buildSuiteKdfDeriveKeyParams(
  suite: AlgorithmSuite,
  salt: BufferSource,
): Pbkdf2Params {
  return buildKdfDeriveKeyParams(suite.kdf, salt);
}

/**
 * Suite-level helper: build symmetric encrypt/decrypt parameters for WebCrypto
 * based on the suite.
 *
 * This selects the suite's symmetric algorithm (e.g. AES-GCM) and converts it
 * into WebCrypto parameter objects.
 *
 * @param suite - Algorithm suite definition
 * @param iv - Per-encryption nonce/IV bytes
 * @param aad - Optional additional authenticated data
 * @returns WebCrypto params for `crypto.subtle.encrypt(...)` / `decrypt(...)`
 */
export function buildSuiteSymmetricParams(
  suite: AlgorithmSuite,
  iv: BufferSource,
  aad?: BufferSource,
): AesGcmParams {
  return buildSymmetricParams(suite.symmetric, iv, aad);
}
