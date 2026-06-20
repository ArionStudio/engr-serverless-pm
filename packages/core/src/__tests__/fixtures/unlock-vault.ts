import { vi } from "vitest";
import type { DeviceAccessMaterial } from "../../domain/device-trust/device-access-material";
import type { VaultSnapshot } from "../../domain/snapshot/vault-snapshot";
import { UnlockVaultUseCase } from "../../use-cases/vault-lifecycle/unlock-vault";
import { createCoreTestPorts } from "./ports";
import { createCoreTestValues } from "./values";

export function createUnlockVaultTestContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  vi.mocked(ports.ids.generateId).mockReset();
  vi.mocked(ports.ids.generateId).mockResolvedValue(values.vaultLockActionId);

  const deviceAccessMaterial: DeviceAccessMaterial = {
    vaultId: values.vaultId,
    deviceId: values.deviceId,
    algorithmSuiteId: ports.crypto.algorithmSuite.id,
    masterPasswordSalt: values.masterPasswordSalt,
    localKeysProtectionSalt: values.localKeysProtectionSalt,
    devicePublicSignKey: values.devicePublicSignKey,
    protectedLocalKeys: values.protectedLocalKeys,
  };

  const vaultSnapshot: VaultSnapshot = {
    metadata: {
      id: values.vaultId,
      schemaVersion: 1,
      vaultCreationTimestamp: values.timestamp,
      revisionTimestamp: values.timestamp,
      snapshotVersionVector: {
        [values.deviceId]: 1,
      },
      algorithmSuiteId: ports.crypto.algorithmSuite.id,
      createdByDeviceId: values.deviceId,
    },
    keySlots: {
      deviceSlots: [
        {
          deviceId: values.deviceId,
          protectedVaultMasterKey: values.protectedDeviceVaultMasterKey,
          publicSignKey: values.devicePublicSignKey,
        },
      ],
    },
    content: values.encryptedVault,
    signature: values.snapshotSignature,
  };

  ports.saved.deviceAccessMaterial = deviceAccessMaterial;
  ports.saved.vaultSnapshot = vaultSnapshot;

  const useCase = new UnlockVaultUseCase(
    ports.clock,
    ports.crypto,
    ports.ids,
    ports.scheduledTasks,
    ports.vaultLocalRepository,
    ports.vaultLockTasks,
    ports.sessionServices.unlockedVaultSession,
  );

  return {
    values,
    ports,
    saved: ports.saved,
    useCase,
    deviceAccessMaterial,
    vaultSnapshot,
  };
}
