import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import { CURRENT_ALGORITHM_SUITE } from "../../domain/crypto/algorithm-suite.const";
import type { DeviceEnrollmentBundle } from "../../domain/device-trust/device-enrollment-bundle";
import type { VaultSnapshotDescriptor } from "../../domain/snapshot/vault-snapshot-descriptor.type";
import type { VaultSnapshot } from "../../domain/snapshot/vault-snapshot";
import type { Vault } from "../../domain/vault/vault";
import {
  DeviceEnrollmentKeySlotNotFoundError,
  DeviceEnrollmentRemoteSnapshotChangedError,
} from "../../errors/device-enrollment.errors";
import {
  RemoteVaultSnapshotChangedError,
  RemoteVaultSnapshotNotFoundError,
  SyncConflictDetectedError,
} from "../../errors/sync.errors";
import { VaultSnapshotSignatureVerificationFailedError } from "../../errors/unlock-vault.errors";
import { PerformDeviceEnrollmentUseCase } from "./perform-device-enrollment";

const enrolledDeviceId = "enrolled-device-id";

function createRemoteVault(values: ReturnType<typeof createCoreTestValues>) {
  return {
    ...values.decryptedVault,
    versionVector: {
      [values.deviceId]: 2,
    },
    syncConfig: values.syncConfig,
    deviceProfiles: [
      {
        id: values.deviceId,
        name: "Trusted laptop",
        createdAt: values.timestamp - 10,
        versionVector: {
          [values.deviceId]: 1,
        },
      },
    ],
  } satisfies Vault;
}

function createRemoteSnapshot(
  values: ReturnType<typeof createCoreTestValues>,
): VaultSnapshot {
  return {
    metadata: {
      id: values.vaultId,
      schemaVersion: 1,
      vaultCreationTimestamp: values.timestamp - 1_000,
      revisionTimestamp: values.timestamp - 1,
      snapshotVersionVector: {
        [values.deviceId]: 2,
      },
      algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
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
      recoveryKeySlot: {
        protectedVaultMasterKey: values.protectedRecoveryVaultMasterKey,
      },
      enrollmentKeySlot: {
        protectedVaultMasterKey: values.protectedEnrollmentVaultMasterKey,
      },
    },
    content: values.encryptedVault,
    signature: values.snapshotSignature,
  };
}

function createContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  const remoteVault = createRemoteVault(values);
  const remoteSnapshot = createRemoteSnapshot(values);
  const remoteSnapshotDescriptor: VaultSnapshotDescriptor = {
    vaultId: values.vaultId,
    snapshotVersionVector: remoteSnapshot.metadata.snapshotVersionVector,
    revisionTimestamp: remoteSnapshot.metadata.revisionTimestamp,
  };
  const enrollmentBundle: DeviceEnrollmentBundle = {
    version: 1,
    vaultId: values.vaultId,
    syncConfig: values.syncConfig,
    snapshotVersionVector: remoteSnapshotDescriptor.snapshotVersionVector,
    revisionTimestamp: remoteSnapshotDescriptor.revisionTimestamp,
    snapshotSignerPublicKey: values.devicePublicSignKey,
    enrollmentSecret: values.deviceEnrollmentSecret,
  };

  vi.mocked(ports.ids.generateId).mockReset();
  vi.mocked(ports.ids.generateId)
    .mockResolvedValueOnce(enrolledDeviceId)
    .mockResolvedValue(values.sessionId);
  vi.mocked(
    ports.syncProvider.getLatestVaultSnapshotDescriptor,
  ).mockResolvedValue(remoteSnapshotDescriptor);
  vi.mocked(ports.syncProvider.downloadVaultSnapshot).mockResolvedValue(
    remoteSnapshot,
  );
  vi.mocked(ports.crypto.decryptVaultSnapshotContent).mockResolvedValue(
    remoteVault,
  );

  return {
    values,
    ports,
    remoteVault,
    remoteSnapshot,
    remoteSnapshotDescriptor,
    enrollmentBundle,
    useCase: new PerformDeviceEnrollmentUseCase(
      ports.clock,
      ports.crypto,
      ports.ids,
      ports.syncProvider,
      ports.sessionServices.unlockedVaultSession,
      ports.vaultDisplayName,
      ports.vaultLocalRepository,
    ),
  };
}

describe("PerformDeviceEnrollmentUseCase", () => {
  it("downloads the enrollment snapshot, registers this device, and uploads it", async () => {
    const ctx = createContext();

    const result = await ctx.useCase.execute({
      enrollmentBundle: ctx.enrollmentBundle,
      masterPassword: ctx.values.masterPassword,
      deviceName: "New laptop",
    });

    const registeredVault: Vault = {
      ...ctx.remoteVault,
      versionVector: {
        [ctx.values.deviceId]: 2,
        [enrolledDeviceId]: 1,
      },
      deviceProfiles: [
        ...ctx.remoteVault.deviceProfiles,
        {
          id: enrolledDeviceId,
          name: "New laptop",
          createdAt: ctx.values.timestamp,
          versionVector: {
            [enrolledDeviceId]: 1,
          },
        },
      ],
    };

    expect(result).toEqual({
      vault: registeredVault,
      snapshotVersionVector: {
        [ctx.values.deviceId]: 2,
        [enrolledDeviceId]: 1,
      },
      revisionTimestamp: ctx.values.timestamp,
      deviceId: enrolledDeviceId,
    });
    expect(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).toHaveBeenCalledWith(ctx.values.syncConfig, ctx.values.vaultId);
    expect(ctx.ports.syncProvider.downloadVaultSnapshot).toHaveBeenCalledWith(
      ctx.values.syncConfig,
      ctx.remoteSnapshotDescriptor,
    );
    expect(ctx.ports.crypto.verifyVaultSnapshotSignature).toHaveBeenCalledWith(
      ctx.remoteSnapshot,
      ctx.values.devicePublicSignKey,
    );
    expect(
      ctx.ports.crypto.deriveEnrollmentVaultMasterKeyProtectionKey,
    ).toHaveBeenCalledWith(ctx.values.deviceEnrollmentSecret);
    expect(ctx.ports.crypto.unwrapVaultMasterKey).toHaveBeenCalledWith(
      ctx.values.protectedEnrollmentVaultMasterKey,
      ctx.values.enrollmentVaultMasterKeyProtectionKey,
    );
    expect(ctx.ports.crypto.decryptVaultSnapshotContent).toHaveBeenCalledWith(
      ctx.values.encryptedVault,
      ctx.values.vaultMasterKey,
    );
    expect(ctx.ports.crypto.encryptVaultSnapshotContent).toHaveBeenCalledWith(
      registeredVault,
      ctx.values.vaultMasterKey,
    );
    expect(ctx.ports.saved.localVaultDescriptor).toEqual({
      vaultId: ctx.values.vaultId,
      displayName: ctx.values.vaultDisplayName,
      createdAt: ctx.values.timestamp,
    });
    expect(ctx.ports.saved.deviceAccessMaterial).toEqual({
      vaultId: ctx.values.vaultId,
      deviceId: enrolledDeviceId,
      algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
      masterPasswordSalt: ctx.values.masterPasswordSalt,
      localKeysProtectionSalt: ctx.values.localKeysProtectionSalt,
      devicePublicSignKey: ctx.values.devicePublicSignKey,
      protectedLocalKeys: ctx.values.protectedLocalKeys,
    });
    expect(ctx.ports.saved.vaultSnapshot).toEqual({
      metadata: {
        ...ctx.remoteSnapshot.metadata,
        snapshotVersionVector: {
          [ctx.values.deviceId]: 2,
          [enrolledDeviceId]: 1,
        },
        revisionTimestamp: ctx.values.timestamp,
        createdByDeviceId: enrolledDeviceId,
      },
      keySlots: {
        deviceSlots: [
          ...ctx.remoteSnapshot.keySlots.deviceSlots,
          {
            deviceId: enrolledDeviceId,
            protectedVaultMasterKey: ctx.values.protectedDeviceVaultMasterKey,
            publicSignKey: ctx.values.devicePublicSignKey,
          },
        ],
        recoveryKeySlot: ctx.remoteSnapshot.keySlots.recoveryKeySlot,
      },
      content: ctx.values.encryptedVault,
      signature: ctx.values.snapshotSignature,
    });
    expect(ctx.ports.saved.unlockedVaultSession).toMatchObject({
      sourceSnapshotVersionVector: {
        [ctx.values.deviceId]: 2,
        [enrolledDeviceId]: 1,
      },
      unlockedVault: {
        vaultId: ctx.values.vaultId,
        deviceId: enrolledDeviceId,
        vault: registeredVault,
      },
    });
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).toHaveBeenCalledWith(
      ctx.values.syncConfig,
      ctx.ports.saved.vaultSnapshot,
      ctx.remoteSnapshotDescriptor,
    );
  });

  it("fails when the remote enrollment snapshot is missing", async () => {
    const ctx = createContext();

    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce(null);

    await expect(
      ctx.useCase.execute({
        enrollmentBundle: ctx.enrollmentBundle,
        masterPassword: ctx.values.masterPassword,
        deviceName: "New laptop",
      }),
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotNotFoundError);

    expect(ctx.ports.syncProvider.downloadVaultSnapshot).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveInitializedLocalVault,
    ).not.toHaveBeenCalled();
  });

  it("rejects a stale enrollment bundle before downloading the snapshot", async () => {
    const ctx = createContext();

    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce({
      ...ctx.remoteSnapshotDescriptor,
      snapshotVersionVector: {
        [ctx.values.deviceId]: 3,
      },
    });

    await expect(
      ctx.useCase.execute({
        enrollmentBundle: ctx.enrollmentBundle,
        masterPassword: ctx.values.masterPassword,
        deviceName: "New laptop",
      }),
    ).rejects.toBeInstanceOf(DeviceEnrollmentRemoteSnapshotChangedError);

    expect(ctx.ports.syncProvider.downloadVaultSnapshot).not.toHaveBeenCalled();
    expect(
      ctx.ports.crypto.verifyVaultSnapshotSignature,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveInitializedLocalVault,
    ).not.toHaveBeenCalled();
  });

  it("rejects a snapshot that is not signed by the package key", async () => {
    const ctx = createContext();

    vi.mocked(
      ctx.ports.crypto.verifyVaultSnapshotSignature,
    ).mockResolvedValueOnce(false);

    await expect(
      ctx.useCase.execute({
        enrollmentBundle: ctx.enrollmentBundle,
        masterPassword: ctx.values.masterPassword,
        deviceName: "New laptop",
      }),
    ).rejects.toBeInstanceOf(VaultSnapshotSignatureVerificationFailedError);

    expect(ctx.ports.crypto.unwrapVaultMasterKey).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveInitializedLocalVault,
    ).not.toHaveBeenCalled();
  });

  it("rejects a snapshot without an active enrollment slot", async () => {
    const ctx = createContext();

    vi.mocked(
      ctx.ports.syncProvider.downloadVaultSnapshot,
    ).mockResolvedValueOnce({
      ...ctx.remoteSnapshot,
      keySlots: {
        deviceSlots: ctx.remoteSnapshot.keySlots.deviceSlots,
        recoveryKeySlot: ctx.remoteSnapshot.keySlots.recoveryKeySlot,
      },
    });

    await expect(
      ctx.useCase.execute({
        enrollmentBundle: ctx.enrollmentBundle,
        masterPassword: ctx.values.masterPassword,
        deviceName: "New laptop",
      }),
    ).rejects.toBeInstanceOf(DeviceEnrollmentKeySlotNotFoundError);

    expect(ctx.ports.crypto.unwrapVaultMasterKey).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveInitializedLocalVault,
    ).not.toHaveBeenCalled();
  });

  it("removes initialized local vault when session commit fails", async () => {
    const ctx = createContext();
    const error = new Error("commit failed");

    vi.mocked(
      ctx.ports.sessionServices.unlockedVaultSession.commit,
    ).mockRejectedValueOnce(error);

    await expect(
      ctx.useCase.execute({
        enrollmentBundle: ctx.enrollmentBundle,
        masterPassword: ctx.values.masterPassword,
        deviceName: "New laptop",
      }),
    ).rejects.toBe(error);

    expect(
      ctx.ports.vaultLocalRepository.saveInitializedLocalVault,
    ).toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.removePersistedLocalVault,
    ).toHaveBeenCalledWith(ctx.values.vaultId);
    expect(ctx.ports.saved.localVaultDescriptor).toBeUndefined();
    expect(ctx.ports.saved.deviceAccessMaterial).toBeUndefined();
    expect(ctx.ports.saved.vaultSnapshot).toBeUndefined();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });

  it("cleans local enrollment state and maps remote upload change to conflict", async () => {
    const ctx = createContext();

    vi.mocked(ctx.ports.syncProvider.uploadVaultSnapshot).mockRejectedValueOnce(
      new RemoteVaultSnapshotChangedError(ctx.values.vaultId),
    );

    await expect(
      ctx.useCase.execute({
        enrollmentBundle: ctx.enrollmentBundle,
        masterPassword: ctx.values.masterPassword,
        deviceName: "New laptop",
      }),
    ).rejects.toBeInstanceOf(SyncConflictDetectedError);

    expect(ctx.ports.syncProvider.uploadVaultSnapshot).toHaveBeenCalled();
    expect(
      ctx.ports.sessionServices.unlockedVaultSession.remove,
    ).toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.removePersistedLocalVault,
    ).toHaveBeenCalledWith(ctx.values.vaultId);
    expect(ctx.ports.saved.unlockedVaultSession).toBeUndefined();
    expect(ctx.ports.saved.localVaultDescriptor).toBeUndefined();
    expect(ctx.ports.saved.deviceAccessMaterial).toBeUndefined();
    expect(ctx.ports.saved.vaultSnapshot).toBeUndefined();
  });
});
