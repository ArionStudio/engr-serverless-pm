/**
 * Storage service port interface.
 *
 * Defines the contract for local vault storage (IndexedDB).
 * IndexedDB is the primary storage; cloud sync is optional.
 *
 * @see docs/security/security-specification.md Section 7.1
 */

import type {
  EncryptedVaultRecord,
  LocalDeviceState,
  PendingSyncItem,
} from "./storage.type";

/**
 * Storage service port interface.
 *
 * Core layer defines the interface; adapters provide Dexie.js implementation.
 */
export interface StoragePort {
  // ─────────────────────────────────────────────────────────────
  // Vault Operations
  // ─────────────────────────────────────────────────────────────

  /**
   * Save encrypted vault to local storage.
   *
   * @param vault - Encrypted vault record
   * @param vaultId - Vault ID
   */
  saveVault(vault: EncryptedVaultRecord, vaultId: string): Promise<void>;

  /**
   * Load encrypted vault from local storage.
   *
   * @param vaultId - Vault ID
   *
   * @returns Encrypted vault record or null if not found
   */
  loadVault(vaultId: string): Promise<EncryptedVaultRecord | null>;

  /**
   * Clear vault from local storage.
   * Used during vault deletion or reset.
   */
  clearVault(): Promise<void>;

  // ─────────────────────────────────────────────────────────────
  // Device State Operations
  // ─────────────────────────────────────────────────────────────

  /**
   * Save device state to local storage.
   *
   * @param deviceId - Device ID
   *
   * @param state - Local device state including wrapped keys
   */
  saveDeviceState(state: LocalDeviceState, deviceId: string): Promise<void>;

  /**
   * Load device state from local storage.
   *
   * @param deviceId - Device ID
   *
   * @returns Device state or null if not registered
   */
  loadDeviceState(deviceId: string): Promise<LocalDeviceState | null>;

  /**
   * Clear device state from local storage.
   * Used during device deregistration.
   */
  clearDeviceState(): Promise<void>;

  // ─────────────────────────────────────────────────────────────
  // Pending Sync Queue Operations
  // ─────────────────────────────────────────────────────────────

  /**
   * Add item to pending sync queue.
   * Used for offline changes that need to be synced.
   *
   * @param item - Pending sync item
   */
  addPendingSync(item: PendingSyncItem): Promise<void>;

  /**
   * Get all pending sync items.
   *
   * @returns Array of pending sync items
   */
  getPendingSyncItems(): Promise<PendingSyncItem[]>;

  /**
   * Remove item from pending sync queue.
   * Called after successful sync.
   *
   * @param itemId - ID of item to remove
   */
  removePendingSync(itemId: string): Promise<void>;

  /**
   * Clear all pending sync items.
   * Used after full sync or reset.
   */
  clearPendingSync(): Promise<void>;

  // ─────────────────────────────────────────────────────────────
  // Database Management
  // ─────────────────────────────────────────────────────────────

  /**
   * Check if storage is initialized and accessible.
   *
   * @returns True if storage is ready
   */
  isReady(): Promise<boolean>;

  /**
   * Delete all data and reset storage.
   * WARNING: This is destructive and irreversible.
   */
  deleteAll(): Promise<void>;
}
