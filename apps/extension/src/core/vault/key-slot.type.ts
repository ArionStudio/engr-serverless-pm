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
 * Secret key slot.
 *
 * Purpose:
 * - Allow device enrollment and disaster recovery using a random 256-bit
 *   secret key generated at genesis and stored offline by the user
 *   (paper backup, USB, etc.). Modeled after 1Password's Secret Key.
 *
 * The secret key serves two roles:
 * 1. **Device enrollment**: A new device enters master password + secret key
 *    to unwrap VaultKey, then creates its own device slot (self-registration).
 * 2. **Disaster recovery**: If all devices are lost, the secret key slot
 *    allows rebuilding access from the cloud vault.
 *
 * Unlike the old master backup slot, this does NOT derive a KEK from the
 * master password. The secret key IS the wrapping key (or is used directly
 * to derive one via the profile's key-wrap algorithm). This ensures that
 * a stolen S3 vault cannot be decrypted with the master password alone —
 * the attacker would also need the secret key.
 *
 * The secret key is:
 * - Generated once at genesis (crypto.getRandomValues, 256 bits)
 * - Displayed to the user exactly once (they must save it offline)
 * - secureWipe()'d from memory immediately after slot creation
 * - Never stored digitally by the extension
 *
 * This slot contains only the wrapped VaultKey bytes. No salt or KDF
 * parameters are needed because the secret key is pre-generated, not
 * password-derived.
 */
export interface SecretKeySlot {
  /** Slot discriminator. */
  readonly type: "secret-key";

  /** Special identifier for the secret key slot. */
  readonly deviceId: "secret_key";

  /**
   * Wrapped VaultKey bytes (base64url).
   *
   * Produced by the profile-selected key wrap algorithm using the
   * secret key as the wrapping key.
   */
  readonly ciphertext: Base64UrlBytes;
}

/**
 * Any supported key slot.
 */
export type KeySlot = DeviceKeySlot | SecretKeySlot;
