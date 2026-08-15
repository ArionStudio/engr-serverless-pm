import { areArrayBuffersEqual } from "../common/array-buffer.utils";
import type { DeviceAccessMaterial } from "./device-access-material";
import type { DeviceAccessRecoveryBackup } from "./device-access-recovery-backup";

type DeviceAccessIdentityRecord = Pick<
  DeviceAccessMaterial | DeviceAccessRecoveryBackup,
  | "algorithmSuiteId"
  | "deviceId"
  | "devicePublicSignKey"
  | "devicePublicVaultKey"
  | "localAccessGenerationId"
  | "vaultId"
>;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function isValidLocalAccessGenerationId(
  value: unknown,
): value is string {
  return isNonEmptyString(value);
}

export function isValidDeviceAccessRecordIdentity(
  record: DeviceAccessIdentityRecord,
): boolean {
  return (
    isNonEmptyString(record.vaultId) &&
    isNonEmptyString(record.deviceId) &&
    isNonEmptyString(record.algorithmSuiteId) &&
    isValidLocalAccessGenerationId(record.localAccessGenerationId) &&
    record.devicePublicSignKey instanceof ArrayBuffer &&
    record.devicePublicVaultKey instanceof ArrayBuffer
  );
}

export function haveSameDeviceAccessIdentity(
  left: DeviceAccessIdentityRecord,
  right: DeviceAccessIdentityRecord,
): boolean {
  return (
    isValidDeviceAccessRecordIdentity(left) &&
    isValidDeviceAccessRecordIdentity(right) &&
    left.vaultId === right.vaultId &&
    left.deviceId === right.deviceId &&
    left.algorithmSuiteId === right.algorithmSuiteId &&
    areArrayBuffersEqual(left.devicePublicSignKey, right.devicePublicSignKey) &&
    areArrayBuffersEqual(left.devicePublicVaultKey, right.devicePublicVaultKey)
  );
}

export function areDeviceAccessRecordsConsistent(
  material: DeviceAccessMaterial,
  backup: DeviceAccessRecoveryBackup,
): boolean {
  return (
    haveSameDeviceAccessIdentity(material, backup) &&
    material.localAccessGenerationId === backup.localAccessGenerationId
  );
}
