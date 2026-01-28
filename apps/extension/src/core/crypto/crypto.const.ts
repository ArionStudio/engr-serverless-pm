/**
 * Cryptographic constants for the password manager.
 *
 * @see docs/security/security-specification.md
 */

import type { AESGCMParameters } from "./crypto.type";

/**
 * Default KDF configuration.
 * 600,000 iterations as per security specification.
 */
export const DEFAULT_KDF_ITERATIONS = 600_000;

/**
 * Minimum salt length in bytes (32 bytes required).
 */
export const MIN_SALT_LENGTH_BYTES = 32;

/**
 * Default AES-GCM configuration.
 */
export const DEFAULT_AES_GCM_PARAMS: AESGCMParameters = {
  algorithm: "AES-256-GCM",
  ivLengthBytes: 12,
  tagLengthBits: 128,
} as const;

/**
 * IV length for AES-GCM (12 bytes).
 * IV must be unique per encryption operation.
 */
export const AES_GCM_IV_LENGTH_BYTES = 12;

/**
 * AES key length in bits.
 */
export const AES_KEY_LENGTH_BITS = 256;

/**
 * Signature encoding for Ed25519 (raw 64 bytes).
 */
export const ED25519_SIGNATURE_LENGTH_BYTES = 64;
