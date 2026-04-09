/**
 * Vault domain types.
 *
 * The vault uses a signed envelope to bind metadata to the encrypted payload:
 * - Envelope: metadata + Ed25519 signature for provenance
 * - Payload: key slots + encrypted data
 *
 * @see docs/security/security-specification.md Section 6
 */

import type { DeviceRegistry } from "../device/device.type";
import type { Folder } from "../passwords/folder.type";
import type { Password } from "../passwords/password.type";
import type { Tag, TagGroup } from "../organization/tag.type";
import type { EncryptedDataPayload } from "./encrypted-payload.type";
import type { KeySlot } from "./key-slot.type";
import type {
  UnsignedVaultEnvelope,
  VaultEnvelope,
} from "./vault-envelope.type";

/**
 * Additional Authenticated Data (AAD) object.
 *
 * AAD binds the envelope metadata and slot list to the encrypted vault data.
 * This prevents metadata/slot tampering attacks because the AAD must match on
 * decryption.
 *
 * Computed as:
 * - `aadBytes = UTF8(JCS(aadObject))`
 *
 * @see docs/security/security-specification.md Section 6.3
 */
export interface AADObject {
  /** AAD format version. */
  readonly version: number;

  /** Unsigned envelope fields bound to the ciphertext. */
  readonly envelope: UnsignedVaultEnvelope;

  /** base64url encoded digest of the key slots list. */
  readonly keySlotsDigest: string;
}

/**
 * Vault payload included in the signed container.
 */
export interface VaultPayload {
  readonly keySlots: KeySlot[];
  readonly data: EncryptedDataPayload;
}

/**
 * Complete signed vault container.
 *
 * Stored/persisted as part of the vault snapshot.
 */
export interface SignedVaultEnvelope {
  readonly version: 1;
  readonly envelope: VaultEnvelope;
  readonly payload: VaultPayload;
}

/**
 * Decrypted vault contents (plaintext).
 *
 * Only exists in memory during an unlocked session.
 */
export interface DecryptedVaultData {
  passwords: Password[];
  folders: Folder[];
  tags: Tag[];
  tagGroups: TagGroup[];
  deviceRegistry: DeviceRegistry;
}
