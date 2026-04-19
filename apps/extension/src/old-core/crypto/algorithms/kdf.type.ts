/**
 * KDF algorithm definitions.
 */

import type { DigestAlgorithmName } from "./hashing.type";

/**
 * PBKDF2-HMAC-SHA-256 KDF definition.
 *
 * WebCrypto usage:
 * - import base key: `{ name: "PBKDF2" }`
 * - derive: `{ name: "PBKDF2", salt, iterations, hash: "SHA-256" }`
 */
export type Pbkdf2HmacSha256KdfAlgorithm = Readonly<{
  readonly kind: "Pbkdf2HmacSha256KdfAlgorithm";
  readonly importAlgorithm: Readonly<{ readonly name: "PBKDF2" }>;
  readonly iterations: 600_000;
  readonly hash: DigestAlgorithmName;
}>;

/**
 * KDF algorithms supported by the system.
 *
 * Extend by widening this union.
 */
export type KdfAlgorithm = Pbkdf2HmacSha256KdfAlgorithm;
