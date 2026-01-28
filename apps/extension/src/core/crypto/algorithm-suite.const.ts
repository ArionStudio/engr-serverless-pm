/**
 * Algorithm suite constants for the cryptographic operations.
 *
 * @see docs/security/security-specification.md Section 3.0
 */

import type { AlgorithmSuite } from "./algorithm-suite.type";

/**
 * Default algorithm suite (suite-v1).
 *
 * - Signing: Ed25519 (EdDSA on Curve25519)
 * - Key Exchange: ECDH P-256
 * - Symmetric: AES-256-GCM
 * - KDF: PBKDF2 with HMAC-SHA-256
 * - Key Wrap: AES-256-KW (RFC 3394)
 */
export const ALGORITHM_SUITE_V1: AlgorithmSuite = {
  id: "suite-v1",
  signing: "Ed25519",
  keyExchange: "ECDH-P256",
  symmetric: "AES-256-GCM",
  kdf: "PBKDF2",
  keyWrap: "AES-KW",
} as const;

/**
 * Current default algorithm suite.
 */
export const DEFAULT_ALGORITHM_SUITE = ALGORITHM_SUITE_V1;
