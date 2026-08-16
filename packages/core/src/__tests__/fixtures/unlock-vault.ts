import { vi } from "vitest";
import type { VaultSnapshot } from "../../domain/snapshot/vault-snapshot";
import { UnlockVaultUseCase } from "../../use-cases/vault-lifecycle/unlock-vault";
import { createCoreTestPorts } from "./ports";
import { createCoreTestValues } from "./values";
import { createDeviceAccessRecords } from "./device-access";

export function createUnlockVaultTestContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  vi.mocked(ports.ids.generateId).mockReset();
  vi.mocked(ports.ids.generateId)
    .mockResolvedValueOnce(values.vaultLockActionId)
    .mockResolvedValue(values.sessionId);

  const { deviceAccessMaterial, deviceAccessRecoveryBackup } =
    createDeviceAccessRecords(values, ports.crypto.algorithmSuite.id);

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
      vaultKeyGeneration: values.vaultKeyGeneration,
    },
    trustChain: values.vaultTrustChain,
    keySlots: {
      deviceSlots: [
        {
          deviceId: values.deviceId,
          vaultKeyGeneration: values.vaultKeyGeneration,
          envelope: values.vaultKeyEnvelope,
        },
      ],
    },
    content: values.encryptedVault,
    signature: values.snapshotSignature,
  };

  ports.saved.deviceAccessMaterial = deviceAccessMaterial;
  ports.saved.deviceAccessRecoveryBackup = deviceAccessRecoveryBackup;
  ports.saved.vaultSnapshot = vaultSnapshot;
  ports.saved.localVaultTrustCheckpoint = values.localVaultTrustCheckpoint;

  const useCase = new UnlockVaultUseCase(
    ports.clock,
    ports.crypto,
    ports.ids,
    ports.scheduledTasks,
    ports.vaultLocalRepository,
    ports.vaultLockTasks,
    ports.sessionServices.unlockedVaultSession,
    ports.clipboardOperations,
  );

  return {
    values,
    ports,
    saved: ports.saved,
    useCase,
    deviceAccessMaterial,
    deviceAccessRecoveryBackup,
    vaultSnapshot,
  };
}
