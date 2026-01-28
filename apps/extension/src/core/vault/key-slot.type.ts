/**
 * Key slot types for vault key distribution.
 *
 * Key slots allow multiple recipients (devices) to decrypt the vault key:
 * - Device slots: ECDH-ES+A256KW (ephemeral key agreement)
 * - Master backup slot: PBKDF2+AESKW (password-derived)
 *
 * @see docs/security/security-specification.md Section 5
 */

/**
 * Device key slot using ECDH-ES with AES-256-KW.
 *
 * Derivation process:
 * 1. Compute ECDH shared secret Z (Ephemeral Priv + Device Pub)
 * 2. Derive KEK using Concat KDF (SHA-256)
 * 3. Wrap Vault Key with KEK (AES-KW)
 */
export interface DeviceKeySlot {
  readonly type: "device";
  readonly deviceId: string;
  readonly alg: "ECDH-ES+A256KW";
  /** JWK format, P-256 */
  readonly epk: JsonWebKey;
  /** base64url */
  readonly apu: string;
  /** base64url */
  readonly apv: string;
  /** base64url encoded AES-KW ciphertext */
  readonly ciphertext: string;
}

/**
 * Master backup key slot using PBKDF2 with AES-256-KW.
 *
 * Allows vault recovery using only the master password.
 * The deviceId is always "master_backup" to identify this slot type.
 */
export interface MasterBackupKeySlot {
  readonly type: "master";
  readonly deviceId: "master_backup";
  readonly alg: "PBKDF2+AESKW";
  readonly hash: "SHA-256";
  /** 600,000 */
  readonly iterations: number;
  /** base64url encoded, 32 bytes */
  readonly salt: string;
  /** base64url encoded AES-KW ciphertext */
  readonly ciphertext: string;
}

export type KeySlot = DeviceKeySlot | MasterBackupKeySlot;
