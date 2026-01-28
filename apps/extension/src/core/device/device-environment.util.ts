/**
 * Device environment utilities.
 *
 * Pure functions for transforming device environment data.
 *
 * @see docs/design/device-environment.md
 */

import type {
  DeviceEnvironment,
  EnvironmentFormState,
} from "./device-environment.type";

/**
 * Convert form state to DeviceEnvironment.
 * Unchecked fields become null.
 */
export function formStateToEnvironment(
  formState: EnvironmentFormState,
): DeviceEnvironment {
  return {
    os: formState.os.include ? formState.os.value : null,
    deviceType: formState.deviceType.include
      ? formState.deviceType.value
      : null,
    browser: formState.browser.include ? formState.browser.value : null,
    browserVersion: formState.browserVersion.include
      ? formState.browserVersion.value
      : null,
    location: formState.location.include ? formState.location.value : null,
    capturedAt: Date.now(),
  };
}
