/**
 * Device environment types for user recognition in UI.
 *
 * These types support the device registration flow where users can
 * customize what environment info to store about their devices.
 *
 * @see docs/design/device-environment.md
 */

/**
 * Device environment for user recognition in UI.
 * All fields nullable - user controls what to store.
 * NOT for security - informational only.
 */
export interface DeviceEnvironment {
  /** e.g., "Windows 11", "macOS" - null if user opted out */
  readonly os: string | null;
  /** e.g., "desktop", "tablet", "mobile" - null if user opted out */
  readonly deviceType: "desktop" | "tablet" | "mobile" | null;
  /** e.g., "Chrome", "Firefox" - null if user opted out */
  readonly browser: string | null;
  /** e.g., "120" - null if user opted out */
  readonly browserVersion: string | null;
  /** e.g., "Warsaw, PL" or user-edited value - null if opted out or failed */
  readonly location: string | null;
  /** Unix ms */
  readonly capturedAt: number;
}

/**
 * A single location record in a device's location history.
 * Recorded on each unlock/sync to help users verify access patterns.
 */
export interface DeviceLocationEntry {
  /** e.g., "Warsaw, PL" or "52.23, 21.01" */
  readonly location: string;
  /** Unix ms — when this location was recorded */
  readonly timestamp: number;
  /** How the location was determined */
  readonly source: "gps" | "ip" | "manual";
}

/**
 * Auto-detected environment before user customization.
 * Used to populate the registration form.
 */
export interface DetectedEnvironment {
  os: string;
  deviceType: "desktop" | "tablet" | "mobile";
  browser: string;
  browserVersion: string;
  /** null if geolocation failed */
  location: string | null;
}

/**
 * User's choices during device registration.
 * Each field has include (checkbox) and value (potentially edited).
 */
export interface EnvironmentFormState {
  os: { include: boolean; value: string };
  deviceType: { include: boolean; value: "desktop" | "tablet" | "mobile" };
  browser: { include: boolean; value: string };
  browserVersion: { include: boolean; value: string };
  location: { include: boolean; value: string };
}
