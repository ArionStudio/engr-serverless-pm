import { ChangeMasterPasswordUseCase } from "../../use-cases/vault-lifecycle/change-master-password";
import { createDeviceAccessRecords } from "./device-access";
import { createCoreTestPorts } from "./ports";
import { createCoreTestValues } from "./values";
import { vi } from "vitest";

export function createChangeMasterPasswordTestContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);

  const { deviceAccessMaterial, deviceAccessRecoveryBackup } =
    createDeviceAccessRecords(values, ports.crypto.algorithmSuite.id);

  ports.saved.deviceAccessMaterial = deviceAccessMaterial;
  ports.saved.deviceAccessRecoveryBackup = deviceAccessRecoveryBackup;
  ports.saved.unlockedVaultSession = {
    sessionId: values.sessionId,
    unlockedVault: {
      vaultId: values.vaultId,
      deviceId: values.deviceId,
      vault: values.decryptedVault,
      vaultMasterKey: values.vaultMasterKey,
      devicePrivateSignKey: values.devicePrivateSignKey,
      devicePrivateVaultKey: values.devicePrivateVaultKey,
      deviceLocalProtectionKey: values.deviceLocalProtectionKey,
      trustedSnapshotContext: {
        snapshotDigest: values.vaultSnapshotDigest,
        trust: values.verifiedVaultTrustState,
      },
      vaultTrustAnchor: values.vaultTrustAnchor,
    },
    sourceSnapshotVersionVector: { [values.deviceId]: 1 },
  };

  vi.mocked(ports.crypto.generateMasterPasswordSalt)
    .mockReset()
    .mockResolvedValue(values.newMasterPasswordSalt);
  vi.mocked(ports.crypto.generateLocalKeysProtectionSalt)
    .mockReset()
    .mockResolvedValue(values.newLocalKeysProtectionSalt);
  vi.mocked(ports.ids.generateId)
    .mockReset()
    .mockResolvedValueOnce(values.replacementLocalAccessGenerationId)
    .mockResolvedValue(values.secondReplacementLocalAccessGenerationId);

  const useCase = new ChangeMasterPasswordUseCase(
    ports.crypto,
    ports.vaultLocalRepository,
    ports.sessionServices.unlockedVaultSession,
    ports.ids,
  );

  return {
    values,
    ports,
    saved: ports.saved,
    useCase,
    deviceAccessMaterial,
    deviceAccessRecoveryBackup,
  };
}
