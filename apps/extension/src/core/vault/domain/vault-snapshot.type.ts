import type { VaultEnvelope } from "./vault-envelope.type";
import type { VaultMetadata } from "./vault-metadata.type";
import type { VaultPayload } from "./vault.type";

/**
 * Persisted vault snapshot format version 1.
 */
export interface VaultSnapshotV1 {
  readonly version: 1;
  readonly metadata: VaultMetadata;
  readonly envelope: VaultEnvelope;
  readonly payload: VaultPayload;
}

export type VaultSnapshot = VaultSnapshotV1;
