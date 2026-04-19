import type { Ed25519SigningAlgorithm } from "./signing.type";

/**
 * Ed25519 signing algorithm.
 */
export const ED25519: Ed25519SigningAlgorithm = {
  kind: "Ed25519SigningAlgorithm",
  algorithm: { name: "Ed25519" },
} as const;
