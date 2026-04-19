import type { Pbkdf2HmacSha256KdfAlgorithm } from "./kdf.type";

/**
 * PBKDF2-HMAC-SHA-256 with 600,000 iterations.
 */
export const PBKDF2_HMAC_SHA256_600K: Pbkdf2HmacSha256KdfAlgorithm = {
  kind: "Pbkdf2HmacSha256KdfAlgorithm",
  importAlgorithm: { name: "PBKDF2" },
  iterations: 600_000,
  hash: "SHA-256",
} as const;
