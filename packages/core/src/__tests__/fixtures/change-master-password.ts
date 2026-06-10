import type { DeviceAccessMaterial } from "../../domain/device/device-access-material";
import { ChangeMasterPasswordUseCase } from "../../use-cases/vault-lifecycle/change-master-password";
import { createCoreTestPorts } from "./ports";
import { createCoreTestValues } from "./values";
import { vi } from "vitest";

export function createChangeMasterPasswordTestContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);

  const deviceAccessMaterial: DeviceAccessMaterial = {
    vaultId: values.vaultId,
    deviceId: values.deviceId,
    algorithmSuiteId: ports.crypto.algorithmSuite.id,
    masterPasswordSalt: values.masterPasswordSalt,
    localKeysProtectionSalt: values.localKeysProtectionSalt,
    devicePublicSignKey: values.devicePublicSignKey,
    protectedLocalKeys: values.protectedLocalKeys,
  };

  ports.saved.deviceAccessMaterial = deviceAccessMaterial;
  ports.saved.unlockedVaultSession = {
    unlockedVault: {
      vaultId: values.vaultId,
      deviceId: values.deviceId,
      vault: values.decryptedVault,
      vaultMasterKey: values.vaultMasterKey,
      devicePrivateSignKey: values.devicePrivateSignKey,
    },
    sourceSnapshotRevision: 1,
  };

  vi.mocked(ports.crypto.generateMasterPasswordSalt)
    .mockReset()
    .mockResolvedValue(values.newMasterPasswordSalt);
  vi.mocked(ports.crypto.generateLocalKeysProtectionSalt)
    .mockReset()
    .mockResolvedValue(values.newLocalKeysProtectionSalt);

  const useCase = new ChangeMasterPasswordUseCase(
    ports.crypto,
    ports.vaultLocalRepository,
    ports.sessionServices.unlockedVaultSession,
  );

  return {
    values,
    ports,
    saved: ports.saved,
    useCase,
    deviceAccessMaterial,
  };
}
