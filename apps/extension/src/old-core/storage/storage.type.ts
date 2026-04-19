/**
 * Local storage types for IndexedDB persistence.
 *
 * IndexedDB is the primary vault storage. Cloud sync is optional.
 *
 * @see docs/security/security-specification.md Section 7.1
 */

import type { WrappedDeviceKeys } from "../device/device-key.type";
import type { CryptoProfileId } from "../crypto/profiles/crypto-profile.type";

/**
 * Local device state stored in IndexedDB.
 * Contains device identity and wrapped keys.
 */
export interface LocalDeviceState {
  /** UUID */
  readonly deviceId: string;
  deviceName: string;
  /** 32 bytes */
  readonly salt: Uint8Array;
  readonly wrappedDeviceKeys: WrappedDeviceKeys;
  readonly vaultId: string;
  /** Unix ms, null if never synced */
  lastSyncTimestamp: number | null;
  /** Unix ms */
  readonly createdAt: number;
}

/**
 * Encrypted vault record stored in IndexedDB.
 */
export interface EncryptedVaultRecord {
  readonly vaultId: string;
  /** Profile used to encrypt and wrap this vault snapshot. */
  readonly profileId: CryptoProfileId;
  /** Serialized encrypted vault snapshot bytes. */
  readonly data: Uint8Array;
  /** Unix ms */
  readonly lastModified: number;
  /** Unix ms, null if never synced */
  lastSyncTimestamp: number | null;
}

export interface PendingSyncItem {
  readonly id: string;
  readonly operation: "create" | "update" | "delete";
  readonly entryId: string;
  /** Unix ms */
  readonly timestamp: number;
  retryCount: number;
}
