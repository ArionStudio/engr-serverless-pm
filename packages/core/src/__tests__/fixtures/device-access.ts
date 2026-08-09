import type { DeviceAccessMaterial } from "../../domain/device-trust/device-access-material";
import type { DeviceAccessRecoveryBackup } from "../../domain/device-trust/device-access-recovery-backup";
import type { CoreTestValues } from "./values";

export function createDeviceAccessRecords(
  values: CoreTestValues,
  algorithmSuiteId: string,
): {
  readonly deviceAccessMaterial: DeviceAccessMaterial;
  readonly deviceAccessRecoveryBackup: DeviceAccessRecoveryBackup;
} {
  return {
    deviceAccessMaterial: {
      revision: 1,
      localAccessGenerationId: values.localAccessGenerationId,
      vaultId: values.vaultId,
      deviceId: values.deviceId,
      algorithmSuiteId,
      masterPasswordSalt: values.masterPasswordSalt,
      localKeysProtectionSalt: values.localKeysProtectionSalt,
      devicePublicSignKey: values.devicePublicSignKey,
      devicePublicVaultKey: values.devicePublicVaultKey,
      protectedLocalKeys: values.protectedLocalKeys,
    },
    deviceAccessRecoveryBackup: {
      revision: 1,
      localAccessGenerationId: values.localAccessGenerationId,
      vaultId: values.vaultId,
      deviceId: values.deviceId,
      algorithmSuiteId,
      recoveryLocalKeysProtectionSalt: values.recoveryLocalKeysProtectionSalt,
      devicePublicSignKey: values.devicePublicSignKey,
      devicePublicVaultKey: values.devicePublicVaultKey,
      protectedLocalKeys: values.recoveryProtectedLocalKeys,
    },
  };
}
