/**
 * Key slot utility functions.
 *
 * @see docs/security/security-specification.md Section 5
 */

import type {
  DeviceKeySlot,
  KeySlot,
  MasterBackupKeySlot,
} from "./key-slot.type";

/**
 * Type guard to check if a key slot is a device slot.
 */
export function isDeviceKeySlot(slot: KeySlot): slot is DeviceKeySlot {
  return slot.type === "device";
}

/**
 * Type guard to check if a key slot is a master backup slot.
 */
export function isMasterBackupKeySlot(
  slot: KeySlot,
): slot is MasterBackupKeySlot {
  return slot.type === "master";
}
