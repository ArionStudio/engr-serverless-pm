/**
 * Vault snapshot (persisted container) types.
 *
 * This is the top-level format stored in IndexedDB and cloud storage.
 *
 * @see docs/security/security-specification.md Section 6
 */

import type { EncryptedDataPayload } from "./encrypted-payload.type";
import type { VaultEnvelope } from "./vault-envelope.type";
import type { VaultMetadata } from "./vault-metadata.type";
import type { KeySlot } from "./key-slot.type";

/**
 * Persisted vault snapshot format (version 1).
 */
export interface VaultSnapshotV1 {
  /**
   * Snapshot format version.
   *
   * Bump this when the persisted container shape changes.
   */
  readonly version: 1;

  /**
   * Crypto and format metadata (profile selection).
   */
  readonly metadata: VaultMetadata;

  /**
   * Signed envelope metadata.
   *
   * The envelope is signed for provenance and anti-tamper checks.
   */
  readonly envelope: VaultEnvelope;

  /**
   * Encrypted payload containing:
   * - key slots used to unwrap the vault key
   * - the encrypted vault data
   */
  readonly payload: Readonly<{
    readonly keySlots: KeySlot[];
    readonly data: EncryptedDataPayload;
  }>;
}

/**
 * Any supported vault snapshot format.
 */
export type VaultSnapshot = VaultSnapshotV1;
