/**
 * Vault envelope types.
 *
 * The envelope is signed metadata used for provenance and anti-tamper checks.
 * It is part of the persisted vault snapshot.
 *
 * @see docs/security/security-specification.md Section 6
 */

/**
 * Vault envelope containing metadata and signature.
 *
 * Signature is computed over the canonicalized (JCS) unsigned envelope.
 */
export interface VaultEnvelope {
  /** base64url encoded, 16+ random bytes */
  readonly vaultId: string;

  /** Identifier of the device that produced the signature. */
  readonly signerDeviceId: string;

  /** Monotonic revision number for conflict resolution. */
  readonly revision: number;

  /** Unix timestamp in milliseconds. */
  readonly timestamp: number;

  /** base64url encoded, raw 64 bytes Ed25519 signature */
  readonly signature: string;
}

/**
 * Unsigned envelope for signing operations.
 */
export type UnsignedVaultEnvelope = Omit<VaultEnvelope, "signature">;
