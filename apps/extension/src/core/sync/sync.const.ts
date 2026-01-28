/**
 * Sync constants.
 *
 * @see docs/design/sync-strategy.md Section 6
 */

import type { SyncOptions } from "./sync.type";

/**
 * Default sync options.
 */
export const DEFAULT_SYNC_OPTIONS: SyncOptions = {
  syncOnUnlock: false,
  autoSyncIntervalMinutes: 0,
} as const;
