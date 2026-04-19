/**
 * Sync diff and conflict types.
 *
 * User-controlled conflict resolution - no auto-merge for security-critical data.
 *
 * @see docs/design/sync-strategy.md Section 3-5
 */

import type { PasswordMetadata } from "../passwords/password.type";

export type ChangeType = "added" | "modified" | "deleted";

export type ConflictReason =
  | "both_modified"
  | "deleted_but_modified"
  | "modified_but_deleted";

/**
 * Single change detected during sync comparison.
 * Used for both auto-resolved changes and conflicts.
 */
export interface SyncChange {
  readonly id: string;
  readonly entryId: string;
  readonly changeType: ChangeType;
  /** null if deleted locally or new remotely */
  readonly localVersion: PasswordMetadata | null;
  /** null if deleted remotely or new locally */
  readonly remoteVersion: PasswordMetadata | null;
  /** Unix ms */
  readonly localTimestamp: number;
  /** Unix ms */
  readonly remoteTimestamp: number;
}

/**
 * Sync conflict requiring user resolution.
 * Extends SyncChange with conflict-specific metadata.
 */
export interface SyncConflict extends SyncChange {
  readonly conflictReason: ConflictReason;
}

export interface SyncDiff {
  readonly autoResolved: SyncChange[];
  readonly conflicts: SyncConflict[];
  /** Unix ms */
  readonly syncTimestamp: number;
}

export type ConflictResolution =
  | { readonly action: "use_local" }
  | { readonly action: "use_remote" }
  | { readonly action: "skip" };

export interface ResolvedConflict {
  readonly conflictId: string;
  readonly resolution: ConflictResolution;
}

export interface ConflictResolutionSet {
  readonly resolutions: ResolvedConflict[];
  /** Unix ms */
  readonly resolvedAt: number;
}
