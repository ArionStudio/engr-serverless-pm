/**
 * Encrypted data payload types.
 *
 * AES-256-GCM is used for vault data encryption.
 *
 * @see docs/security/security-specification.md Section 6.3
 */

/**
 * Encrypted data payload structure (AES-256-GCM).
 *
 * - IV must be unique per encryption (12 bytes)
 * - Ciphertext includes the GCM authentication tag
 */
export interface EncryptedDataPayload {
  readonly alg: "A256GCM";
  /** base64url encoded, 12 bytes */
  readonly iv: string;
  /** base64url encoded, includes GCM tag */
  readonly ciphertext: string;
}

/**
 * Generic encrypted blob for arbitrary data.
 * Used for encrypting individual items or export files.
 */
export interface EncryptedBlob {
  readonly alg: "A256GCM";
  /** base64url encoded, 12 bytes */
  readonly iv: string;
  /** base64url encoded, includes GCM tag */
  readonly ciphertext: string;
  /** if password-derived key was used */
  readonly salt?: string;
  /** if password-derived key was used */
  readonly iterations?: number;
}
