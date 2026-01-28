/**
 * Vault envelope and signed vault types.
 *
 * The vault uses a "Signed Envelope" format with:
 * - Envelope: Metadata + Ed25519 signature for provenance
 * - Payload: Key slots + encrypted data
 *
 * @see docs/security/security-specification.md Section 6
 */

import type { DeviceRegistry } from "../device/device.type";
import type { Folder } from "../passwords/folder.type";
import type { Password } from "../passwords/password.type";
import type { Tag, TagGroup } from "../organization/tag.type";
import type { EncryptedDataPayload } from "./encrypted-data.type";
import type { KeySlot } from "./key-slot.type";

/**
 * Vault envelope containing metadata and signature.
 * The signature is computed over the canonicalized (JCS) envelope.
 */
export interface VaultEnvelope {
  /** base64url encoded, 16+ random bytes */
  readonly vaultId: string;
  readonly signerDeviceId: string;
  readonly revision: number;
  /** Unix ms */
  readonly timestamp: number;
  /** base64url encoded, raw 64 bytes */
  readonly signature: string;
}

/**
 * Unsigned envelope for signing operations.
 * Contains all envelope fields except the signature.
 */
export type UnsignedVaultEnvelope = Omit<VaultEnvelope, "signature">;

/**
 * Additional Authenticated Data (AAD) object.
 *
 * AAD binds the envelope metadata to the encrypted data,
 * preventing metadata tampering attacks.
 *
 * Computed as: UTF8(JCS(aadObject))
 *
 * @see docs/security/security-specification.md Section 6.3
 */
export interface AADObject {
  readonly version: number;
  readonly envelope: UnsignedVaultEnvelope;
  /** base64url encoded */
  readonly keySlotsDigest: string;
}

export interface VaultPayload {
  readonly keySlots: KeySlot[];
  readonly data: EncryptedDataPayload;
}

/**
 * Complete signed vault envelope structure.
 * This is the top-level format stored in IndexedDB and cloud storage.
 *
 * File format uses:
 * - Binary: base64url (no padding)
 * - Strings: UTF-8
 * - Canonicalization: RFC 8785 JCS
 */
export interface SignedVaultEnvelope {
  readonly version: 1;
  readonly envelope: VaultEnvelope;
  readonly payload: VaultPayload;
}

/**
 * Decrypted vault contents (plaintext).
 * Only exists in memory during an unlocked session.
 */
export interface DecryptedVaultData {
  passwords: Password[];
  folders: Folder[];
  tags: Tag[];
  tagGroups: TagGroup[];
  deviceRegistry: DeviceRegistry;
}
