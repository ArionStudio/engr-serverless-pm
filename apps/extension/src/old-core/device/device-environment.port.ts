/**
 * Port for detecting device environment.
 *
 * @see docs/design/device-environment.md
 */

import type { DetectedEnvironment } from "./device-environment.type";

/**
 * Port for detecting device environment.
 * Implemented by adapters layer.
 */
export interface DeviceEnvironmentPort {
  /** Detect current device environment (async for geolocation) */
  detect(): Promise<DetectedEnvironment>;
}
