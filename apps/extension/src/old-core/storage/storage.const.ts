/**
 * Local storage constants for IndexedDB persistence.
 *
 * @see docs/security/security-specification.md Section 7.1
 */

/**
 * IndexedDB schema version for migrations.
 */
export const STORAGE_SCHEMA_VERSION = 1;

/**
 * IndexedDB database name.
 */
export const DATABASE_NAME = "spm-vault";

/**
 * IndexedDB store names.
 */
export const STORE_NAMES = {
  DEVICE_STATE: "deviceState",
  VAULT: "vault",
  PENDING_SYNC: "pendingSync",
  SETTINGS: "settings",
} as const;
