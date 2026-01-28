/**
 * Device identity and registry types.
 *
 * Each device generates a unique identity on first setup.
 * The device registry tracks all authorized devices for the vault.
 *
 * @see docs/design/multi-device-setup.md
 * @see docs/security/security-specification.md Section 4
 */

import type { DeviceEnvironment } from "./device-environment.type";

export interface DeviceIdentity {
  /** UUID, generated once per device */
  readonly deviceId: string;
  /** e.g., "Work Laptop", "Home PC" */
  deviceName: string;
}

/**
 * Device registry entry with full metadata.
 * Stored in the vault envelope to track authorized devices.
 */
export interface DeviceRegistryEntry {
  readonly deviceId: string;
  deviceName: string;
  /** JWK format */
  readonly publicSignKey: JsonWebKey;
  /** JWK format */
  readonly publicExchangeKey: JsonWebKey;
  /** Unix ms */
  readonly createdAt: number;
  /** Unix ms, null if never synced */
  lastSyncTimestamp: number | null;
  /** Captured at registration - user-controlled environment info */
  readonly environment: DeviceEnvironment;
}

export interface DeviceRegistry {
  devices: DeviceRegistryEntry[];
}

/**
 * Device information for display in UI.
 * Extended with browser/OS info for user recognition.
 */
export interface DeviceDisplayInfo extends DeviceIdentity {
  /** e.g., "Chrome 120 on Windows" */
  readonly browserInfo: string;
  /** Unix ms */
  readonly firstSeen: number;
  /** Unix ms */
  readonly lastSync: number | null;
  readonly isCurrentDevice: boolean;
}
