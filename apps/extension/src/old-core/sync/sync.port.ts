/**
 * Sync port interface.
 *
 * Defines the contract for cloud sync operations.
 * Implementations handle provider-specific details (S3, GCS, etc.).
 *
 * @see docs/design/sync-strategy.md
 */
export interface SyncPort {
  // ─────────────────────────────────────────────────────────────
  // Object Operations
  // ─────────────────────────────────────────────────────────────

  /**
   * Upload data to cloud storage.
   *
   * @param key - Object key (path)
   * @param data - Data bytes to upload
   */
  upload(key: string, data: Uint8Array): Promise<void>;

  /**
   * Download data from cloud storage.
   *
   * @param key - Object key (path)
   * @returns Data bytes or null if not found
   */
  download(key: string): Promise<Uint8Array | null>;

  /**
   * Delete object from cloud storage.
   *
   * @param key - Object key (path)
   */
  delete(key: string): Promise<void>;

  /**
   * List objects in cloud storage with optional prefix.
   *
   * @param prefix - Optional prefix to filter by
   * @returns Array of object keys
   */
  list(prefix?: string): Promise<string[]>;

  // ─────────────────────────────────────────────────────────────
  // Sync Metadata
  // ─────────────────────────────────────────────────────────────

  /**
   * Get last sync timestamp for this device.
   *
   * @returns Timestamp or null if never synced
   */
  getLastSyncTimestamp(): Promise<number | null>;

  /**
   * Update last sync timestamp.
   *
   * @param timestamp - New sync timestamp
   */
  setLastSyncTimestamp(timestamp: number): Promise<void>;

  // ─────────────────────────────────────────────────────────────
  // Connection Management
  // ─────────────────────────────────────────────────────────────

  /**
   * Test connection to cloud provider.
   *
   * @returns True if connection is successful
   */
  testConnection(): Promise<boolean>;

  /**
   * Check if sync is configured and enabled.
   *
   * @returns True if sync is available
   */
  isEnabled(): Promise<boolean>;

  /**
   * Initialize sync service with configuration.
   * Must be called before other operations.
   */
  initialize(): Promise<void>;

  /**
   * Disconnect and clean up sync service.
   */
  disconnect(): Promise<void>;
}
