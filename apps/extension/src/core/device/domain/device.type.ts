import type {
  DeviceEnvironment,
  DeviceLocationEntry,
} from "./device-environment.type";
import type { ExportedPublicKeyMaterial } from "./device-key.type";

export interface DeviceIdentity {
  readonly deviceId: string;
  deviceName: string;
}

export interface DeviceRegistryEntry {
  readonly deviceId: string;
  deviceName: string;
  readonly publicSignKey: ExportedPublicKeyMaterial;
  readonly publicAgreementKey: ExportedPublicKeyMaterial;
  readonly createdAt: number;
  lastSyncTimestamp: number | null;
  readonly environment: DeviceEnvironment;
  locationHistory: DeviceLocationEntry[];
}

export interface DeviceRegistry {
  devices: DeviceRegistryEntry[];
}

export interface DeviceDisplayInfo extends DeviceIdentity {
  readonly browserInfo: string;
  readonly firstSeen: number;
  readonly lastSync: number | null;
  readonly isCurrentDevice: boolean;
}
