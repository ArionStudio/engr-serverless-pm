import type { DeviceAccessMaterial } from "../../domain/device/device-access-material";
import type { VaultSnapshot } from "../../domain/snapshot/vault-snapshot";
import { UnlockVaultUseCase } from "../../use-cases/vault-lifecycle/unlock-vault";
import { createCoreTestPorts } from "./ports";
import { createCoreTestValues } from "./values";

export function createUnlockVaultTestContext() {
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

  const vaultSnapshot: VaultSnapshot = {
    metadata: {
      id: values.vaultId,
      schemaVersion: 1,
      vaultCreationTimestamp: values.timestamp,
      revisionTimestamp: values.timestamp,
      revision: 1,
      algorithmSuiteId: ports.crypto.algorithmSuite.id,
      createdByDeviceId: values.deviceId,
    },
    trustedDevices: [
      {
        id: values.deviceId,
        publicKeys: {
          signingKey: values.devicePublicSignKey,
        },
      },
    ],
    keySlots: {
      deviceSlots: [
        {
          deviceId: values.deviceId,
          protectedVaultMasterKey: values.protectedDeviceVaultMasterKey,
        },
      ],
      recoveryKeySlot: {
        protectedVaultMasterKey: values.protectedRecoveryVaultMasterKey,
      },
    },
    content: values.encryptedVault,
    signature: values.snapshotSignature,
  };

  ports.saved.deviceAccessMaterial = deviceAccessMaterial;
  ports.saved.vaultSnapshot = vaultSnapshot;

  const useCase = new UnlockVaultUseCase(
    ports.crypto,
    ports.vaultLocalRepository,
    ports.unlockedVaultRepository,
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
