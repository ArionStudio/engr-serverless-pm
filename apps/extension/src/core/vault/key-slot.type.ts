/**
 * Key slot types for vault key distribution.
 *
 * A vault snapshot contains:
 * - `VaultMetadata.profileId` selecting the complete crypto configuration
 * - One or more `KeySlot`s that allow different unlock/recovery paths to unwrap
 *   the VaultKey (DEK).
 *
 * Important design rule (your requirement):
 * - `profileId` in vault metadata is the ONLY source of truth for algorithms and
 *   formats. Slots do NOT duplicate KDF/hash/iterations/etc.
 *
 * This makes slots smaller and avoids conflicting sources of truth.
 *
 * @see docs/security/security-specification.md Section 5
 */

import type { PublicKeyFormat } from "../crypto/formats/key-format.type";

/**
 * Base64url-encoded bytes (no padding).
 *
 * Used to store binary values in JSON snapshots.
 *
 * Branded type to prevent accidental use of plaintext strings
 * where encoded bytes are expected.
 */
declare const Base64UrlBytesBrand: unique symbol;
export type Base64UrlBytes = string & { readonly [Base64UrlBytesBrand]: true };

/**
 * Slot-carried public key.
 *
 * The encoding is selected by the resolved serialization suite (via vault metadata
 * profileId). The payload stores:
 * - `format`: how to interpret `data` (e.g. "spki" or "raw")
 * - `data`: base64url encoded bytes of the public key in that format
 */
export type SlotPublicKey = Readonly<{
  readonly format: PublicKeyFormat;
  readonly data: Base64UrlBytes;
}>;

/**
 * Device key slot.
 *
 * Purpose:
 * - Allow a specific device to unwrap the VaultKey without knowing the master password.
 *
 * Mechanism (conceptual, profile-defined):
 * - Uses key agreement between:
 *   - device agreement private key (stored on the device, protected by PIN)
 *   - ephemeral agreement public key (stored in this slot as `epk`)
 * - Derives a wrapping key (KEK) from the shared secret using a profile-defined KDF
 * - Wraps the VaultKey using the profile-defined key wrap algorithm
 *
 * Fields:
 * - `epk`: Ephemeral public key generated when creating the slot.
 *   The device needs it to compute the same shared secret.
 *
 * - `apu` / `apv`: KDF context inputs ("PartyUInfo" / "PartyVInfo").
 *   They bind the derived KEK to this specific context (e.g. device/vault),
 *   preventing key reuse across different slots or recipients.
 *   These values are stored explicitly because they are inputs to the KEK
 *   derivation and are required for deterministic re-derivation on the device.
 *
 * - `ciphertext`: Wrapped VaultKey bytes (base64url).
 */
export interface DeviceKeySlot {
  /** Slot discriminator. */
  readonly type: "device";

  /** Recipient device identifier. */
  readonly deviceId: string;

  /**
   * Ephemeral public key for key agreement.
   *
   * Stored as bytes + format tag to support multiple encodings over time.
   */
  readonly epk: SlotPublicKey;

  /**
   * KDF context: PartyUInfo (base64url bytes).
   *
   * Used during KEK derivation to bind the KEK to the sender/recipient context.
   */
  readonly apu: Base64UrlBytes;

  /**
   * KDF context: PartyVInfo (base64url bytes).
   *
   * Used during KEK derivation to bind the KEK to the sender/recipient context.
   */
  readonly apv: Base64UrlBytes;

  /**
   * Wrapped VaultKey bytes (base64url).
   *
   * Produced by the profile-selected key wrap algorithm.
   */
  readonly ciphertext: Base64UrlBytes;
}

/**
 * Master backup key slot.
 *
 * Purpose:
 * - Allow vault recovery using the master password-derived KEK (or another
 *   user-held recovery secret), as defined by the active profile.
 *
 * This slot intentionally stores ONLY what cannot be derived from:
 * - vault metadata (profileId)
 * - user input at unlock time (master password)
 *
 * Therefore, it contains only:
 * - a KDF salt (needed to re-derive the same KEK)
 * - the wrapped VaultKey bytes
 */
export interface MasterBackupKeySlot {
  /** Slot discriminator. */
  readonly type: "master";

  /** Special identifier for the master backup slot. */
  readonly deviceId: "master_backup";

  /**
   * KDF salt used to derive the master/backup KEK for this slot (base64url).
   *
   * The KDF algorithm and parameters (iterations/hash/etc.) are resolved from
   * `VaultMetadata.profileId` and MUST NOT be duplicated here.
   */
  readonly salt: Base64UrlBytes;

  /**
   * Wrapped VaultKey bytes (base64url).
   */
  readonly ciphertext: Base64UrlBytes;
}

/**
 * Any supported key slot.
 */
export type KeySlot = DeviceKeySlot | MasterBackupKeySlot;
