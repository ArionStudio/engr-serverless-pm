import type { Sha256DigestAlgorithm } from "./hashing.type";

/**
 * SHA-256 digest algorithm.
 */
export const SHA_256: Sha256DigestAlgorithm = {
  kind: "Sha256DigestAlgorithm",
  name: "SHA-256",
} as const;
