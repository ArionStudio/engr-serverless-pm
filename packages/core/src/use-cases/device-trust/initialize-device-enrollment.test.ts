import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import {
  createUnlockedVaultWithEntries,
  createVaultSnapshotServiceMock,
} from "../../__tests__/fixtures/vault-entries";
import type { VaultSnapshotDescriptor } from "../../domain/snapshot/vault-snapshot-descriptor.type";
import { DeviceEnrollmentVaultNotSynchronizedError } from "../../errors/device-enrollment.errors";
import {
  RemoteVaultSnapshotAheadError,
  SyncNotConfiguredError,
} from "../../errors/sync.errors";
import { VaultSnapshotSignatureVerificationFailedError } from "../../errors/unlock-vault.errors";
import { VaultMustBeUnlockedError } from "../../errors/vault-session.errors";
import { VaultSnapshotVersionMismatchError } from "../../errors/vault-snapshot.errors";
import { VaultSyncGuardService } from "../../services/sync";
import { InitializeDeviceEnrollmentUseCase } from "./initialize-device-enrollment";

function createContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  const vaultSnapshot = createVaultSnapshotServiceMock(values);
  const vaultSyncGuard = new VaultSyncGuardService(
    ports.syncProvider,
    vaultSnapshot,
  );
  const unlockedVault = createUnlockedVaultWithEntries(values, []);

  ports.saved.unlockedVaultSession = {
    unlockedVault: {
      ...unlockedVault,
      vault: {
        ...unlockedVault.vault,
        syncConfig: values.syncConfig,
      },
    },
    sourceSnapshotVersionVector: {
      [values.deviceId]: 1,
    },
  };
  const remoteSnapshotDescriptor: VaultSnapshotDescriptor = {
    vaultId: values.vaultId,
    snapshotVersionVector: {
      [values.deviceId]: 1,
    },
    revisionTimestamp: values.timestamp,
  };
  vi.mocked(
    ports.syncProvider.getLatestVaultSnapshotDescriptor,
  ).mockResolvedValue(remoteSnapshotDescriptor);

  return {
    values,
    ports,
    remoteSnapshotDescriptor,
    vaultSnapshot,
    useCase: new InitializeDeviceEnrollmentUseCase(
      ports.clock,
      ports.crypto,
      ports.sessionServices.unlockedVaultSession,
      vaultSyncGuard,
      ports.vaultLocalRepository,
    ),
  };
}

describe("InitializeDeviceEnrollmentUseCase", () => {
  it("creates a local enrollment snapshot and returns a secret bundle", async () => {
    const ctx = createContext();
    const initialUnlockedVault =
      ctx.ports.saved.unlockedVaultSession?.unlockedVault;

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        remoteSnapshotDescriptor: ctx.remoteSnapshotDescriptor,
      }),
    ).resolves.toEqual({
      enrollmentBundle: {
        version: 1,
        vaultId: ctx.values.vaultId,
        syncConfig: ctx.values.syncConfig,
        snapshotSignerPublicKey: ctx.values.devicePublicSignKey,
        enrollmentSecret: ctx.values.deviceEnrollmentSecret,
      },
      snapshotVersionVector: {
        [ctx.values.deviceId]: 2,
      },
      revisionTimestamp: ctx.values.timestamp,
    });

    expect(
      ctx.vaultSnapshot.requireCurrentSnapshotForUnlockedVault,
    ).toHaveBeenCalledWith(ctx.values.vaultId, initialUnlockedVault, {
      [ctx.values.deviceId]: 1,
    });
    expect(ctx.ports.crypto.verifyVaultSnapshotSignature).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          id: ctx.values.vaultId,
          snapshotVersionVector: {
            [ctx.values.deviceId]: 1,
          },
        }),
      }),
      ctx.values.devicePublicSignKey,
    );
    expect(ctx.ports.crypto.generateDeviceEnrollmentSecret).toHaveBeenCalled();
    expect(
      ctx.ports.crypto.deriveEnrollmentVaultMasterKeyProtectionKey,
    ).toHaveBeenCalledWith(ctx.values.deviceEnrollmentSecret);
    expect(ctx.ports.crypto.wrapVaultMasterKey).toHaveBeenCalledWith(
      ctx.values.vaultMasterKey,
      ctx.values.enrollmentVaultMasterKeyProtectionKey,
    );
    expect(ctx.ports.crypto.encryptVaultSnapshotContent).toHaveBeenCalledWith(
      initialUnlockedVault?.vault,
      ctx.values.vaultMasterKey,
    );
    expect(ctx.ports.saved.vaultSnapshot).toEqual({
      metadata: {
        id: ctx.values.vaultId,
        schemaVersion: 1,
        vaultCreationTimestamp: ctx.values.timestamp - 1_000,
        revisionTimestamp: ctx.values.timestamp,
        snapshotVersionVector: {
          [ctx.values.deviceId]: 2,
        },
        algorithmSuiteId: ctx.ports.crypto.algorithmSuite.id,
        createdByDeviceId: ctx.values.deviceId,
      },
      keySlots: {
        deviceSlots: [
          {
            deviceId: ctx.values.deviceId,
            protectedVaultMasterKey: ctx.values.protectedDeviceVaultMasterKey,
            publicSignKey: ctx.values.devicePublicSignKey,
          },
        ],
        recoveryKeySlot: {
          protectedVaultMasterKey: ctx.values.protectedRecoveryVaultMasterKey,
        },
        enrollmentKeySlot: {
          protectedVaultMasterKey: ctx.values.protectedEnrollmentVaultMasterKey,
        },
      },
      content: ctx.values.encryptedVault,
      signature: ctx.values.snapshotSignature,
    });
    expect(ctx.ports.saved.unlockedVaultSession).toMatchObject({
      sourceSnapshotVersionVector: {
        [ctx.values.deviceId]: 2,
      },
      unlockedVault: {
        vaultId: ctx.values.vaultId,
        deviceId: ctx.values.deviceId,
        vault: {
          versionVector: {
            [ctx.values.deviceId]: 1,
          },
          syncConfig: ctx.values.syncConfig,
        },
      },
    });
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
    expect(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).toHaveBeenCalledWith(ctx.values.syncConfig, ctx.values.vaultId);
  });

  it("fails when sync is not configured", async () => {
    const ctx = createContext();
    const session = ctx.ports.saved.unlockedVaultSession;

    if (session !== undefined) {
      ctx.ports.saved.unlockedVaultSession = {
        ...session,
        unlockedVault: {
          ...session.unlockedVault,
          vault: {
            ...session.unlockedVault.vault,
            syncConfig: undefined,
          },
        },
      };
    }

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        remoteSnapshotDescriptor: ctx.remoteSnapshotDescriptor,
      }),
    ).rejects.toBeInstanceOf(SyncNotConfiguredError);

    expect(
      ctx.vaultSnapshot.requireCurrentSnapshotForUnlockedVault,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.crypto.generateDeviceEnrollmentSecret,
    ).not.toHaveBeenCalled();
  });

  it("fails when the target vault is not unlocked", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSession = undefined;

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        remoteSnapshotDescriptor: ctx.remoteSnapshotDescriptor,
      }),
    ).rejects.toBeInstanceOf(VaultMustBeUnlockedError);

    expect(
      ctx.vaultSnapshot.requireCurrentSnapshotForUnlockedVault,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.crypto.generateDeviceEnrollmentSecret,
    ).not.toHaveBeenCalled();
  });

  it("does not create enrollment material when snapshot preflight fails", async () => {
    const ctx = createContext();
    const error = new VaultSnapshotVersionMismatchError(
      ctx.values.vaultId,
      { [ctx.values.deviceId]: 1 },
      { [ctx.values.deviceId]: 2 },
    );

    vi.mocked(
      ctx.vaultSnapshot.requireCurrentSnapshotForUnlockedVault,
    ).mockRejectedValueOnce(error);

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        remoteSnapshotDescriptor: ctx.remoteSnapshotDescriptor,
      }),
    ).rejects.toBe(error);

    expect(
      ctx.ports.crypto.generateDeviceEnrollmentSecret,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
  });

  it("does not create enrollment material when the local snapshot does not match remote", async () => {
    const ctx = createContext();

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        remoteSnapshotDescriptor: {
          ...ctx.remoteSnapshotDescriptor,
          snapshotVersionVector: {
            [ctx.values.deviceId]: 2,
          },
        },
      }),
    ).rejects.toBeInstanceOf(DeviceEnrollmentVaultNotSynchronizedError);

    expect(
      ctx.ports.crypto.generateDeviceEnrollmentSecret,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
  });

  it("does not create enrollment material when synced remote changes must be downloaded first", async () => {
    const ctx = createContext();

    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce({
      vaultId: ctx.values.vaultId,
      snapshotVersionVector: {
        [ctx.values.deviceId]: 1,
        "remote-device-id": 1,
      },
      revisionTimestamp: ctx.values.timestamp + 1,
    });

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        remoteSnapshotDescriptor: ctx.remoteSnapshotDescriptor,
      }),
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotAheadError);

    expect(
      ctx.ports.crypto.generateDeviceEnrollmentSecret,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
  });

  it("does not create enrollment material when snapshot signature is invalid", async () => {
    const ctx = createContext();

    vi.mocked(
      ctx.ports.crypto.verifyVaultSnapshotSignature,
    ).mockResolvedValueOnce(false);

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        remoteSnapshotDescriptor: ctx.remoteSnapshotDescriptor,
      }),
    ).rejects.toBeInstanceOf(VaultSnapshotSignatureVerificationFailedError);

    expect(
      ctx.ports.crypto.generateDeviceEnrollmentSecret,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
  });
});
