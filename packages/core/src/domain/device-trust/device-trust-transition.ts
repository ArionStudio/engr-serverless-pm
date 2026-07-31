import type { DeviceEnrollmentTransition } from "./device-enrollment";
import type { DeviceRevocationTransition } from "./device-revocation";

export type DeviceTrustTransition =
  | DeviceEnrollmentTransition
  | DeviceRevocationTransition;
