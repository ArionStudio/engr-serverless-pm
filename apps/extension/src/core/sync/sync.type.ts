/**
 * Sync status and result types.
 *
 * @see docs/design/sync-strategy.md Section 6
 */

import type { SyncDiff } from "./sync-diff.type";

export interface SyncError {
  readonly type:
    | "network"
    | "auth"
    | "corruption"
    | "version_mismatch"
    | "unknown";
  readonly message: string;
  readonly cause?: unknown;
}

export interface SyncSummary {
  readonly added: number;
  readonly modified: number;
  readonly deleted: number;
  readonly skipped: number;
  /** Unix ms */
  readonly timestamp: number;
}

/**
 * Sync status state machine.
 * Represents all possible states during a sync operation.
 */
export type SyncStatus =
  | { readonly state: "idle" }
  | { readonly state: "checking" }
  | { readonly state: "downloading" }
  | { readonly state: "comparing" }
  | { readonly state: "conflicts"; readonly diff: SyncDiff }
  | { readonly state: "uploading" }
  | { readonly state: "complete"; readonly summary: SyncSummary }
  | { readonly state: "error"; readonly error: SyncError };

export interface SyncOptions {
  readonly syncOnUnlock: boolean;
  /** 0 = disabled */
  readonly autoSyncIntervalMinutes: number;
}
