/**
 * Key slot utility functions.
 *
 * @see docs/security/security-specification.md Section 5
 */

import type { DeviceKeySlot, KeySlot, SecretKeySlot } from "./key-slot.type";

/**
 * Type guard to check if a key slot is a device slot.
 */
export function isDeviceKeySlot(slot: KeySlot): slot is DeviceKeySlot {
  return slot.type === "device";
}

/**
 * Type guard to check if a key slot is a secret key slot.
 */
export function isSecretKeySlot(slot: KeySlot): slot is SecretKeySlot {
  return slot.type === "secret-key";
}
