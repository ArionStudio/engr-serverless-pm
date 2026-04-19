export interface DeviceEnvironment {
  readonly userAgent: string;
  readonly browserName: string;
  readonly browserVersion: string;
  readonly osName: string;
  readonly osVersion: string;
  readonly deviceType: "desktop" | "laptop" | "tablet" | "mobile" | "unknown";
}

export interface DeviceLocationEntry {
  readonly recordedAt: number;
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracyMeters: number | null;
  readonly source: "geolocation" | "ip" | "unknown";
}
