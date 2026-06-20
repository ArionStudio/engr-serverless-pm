import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import {
  createUnlockedVaultWithEntries,
  createVaultSnapshotServiceMock,
} from "../../__tests__/fixtures/vault-entries";
import {
  RemoteVaultSnapshotAheadError,
  RemoteVaultSnapshotIntegrityError,
  SyncNotConfiguredError,
} from "../../errors/sync.errors";
import { VaultMustBeUnlockedError } from "../../errors/vault-session.errors";
import { VaultSnapshotVersionMismatchError } from "../../errors/vault-snapshot.errors";
import { DisableSyncUseCase } from "./disable-sync";

function createContext(syncConfigured = true) {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  const vaultSnapshot = createVaultSnapshotServiceMock(values);
  const currentDeviceProfile = {
    id: values.deviceId,
    name: "Current laptop",
    createdAt: values.timestamp - 1,
    versionVector: {
      [values.deviceId]: 1,
    },
  };
  const unlockedVault = {
    ...createUnlockedVaultWithEntries(values, []),
    vault: {
      ...values.decryptedVault,
      deviceProfiles: [currentDeviceProfile],
      ...(syncConfigured ? { syncConfig: values.syncConfig } : {}),
    },
  };

  ports.saved.unlockedVaultSession = {
    unlockedVault,
    sourceSnapshotVersionVector: {
      [values.deviceId]: 1,
    },
  };

  return {
    values,
    ports,
    saved: ports.saved,
    vaultSnapshot,
    useCase: new DisableSyncUseCase(
      ports.clock,
      ports.syncProvider,
      ports.sessionServices.unlockedVaultSession,
      vaultSnapshot,
    ),
  };
}

describe("DisableSyncUseCase", () => {
  it("removes remote snapshots and then removes local sync config", async () => {
    const ctx = createContext();
    const otherDeviceId = "other-device-id";
    const currentDeviceSlot = {
      deviceId: ctx.values.deviceId,
      protectedVaultMasterKey: ctx.values.protectedDeviceVaultMasterKey,
      publicSignKey: ctx.values.devicePublicSignKey,
    };
    const otherDeviceSlot = {
      deviceId: otherDeviceId,
      protectedVaultMasterKey: ctx.values.protectedDeviceVaultMasterKey,
      publicSignKey: ctx.values.pendingDevicePublicSignKey,
    };
    const session = ctx.saved.unlockedVaultSession;
    const localSnapshot = {
      metadata: {
        id: ctx.values.vaultId,
        schemaVersion: 1 as const,
        vaultCreationTimestamp: ctx.values.timestamp - 1_000,
        revisionTimestamp: ctx.values.timestamp,
        snapshotVersionVector: {
          [ctx.values.deviceId]: 1,
        },
        algorithmSuiteId: ctx.ports.crypto.algorithmSuite.id,
        createdByDeviceId: ctx.values.deviceId,
      },
      keySlots: {
        deviceSlots: [currentDeviceSlot, otherDeviceSlot],
        enrollmentKeySlot: {
          enrollmentId: ctx.values.enrollmentId,
          pendingDeviceId: ctx.values.pendingDeviceId,
          pendingDevicePublicSignKey: ctx.values.pendingDevicePublicSignKey,
          pendingDevicePublicSignKeyDigest:
            ctx.values.pendingDevicePublicSignKeyDigest,
          protectedVaultMasterKeyDigest:
            ctx.values.protectedEnrollmentVaultMasterKeyDigest,
          protectedVaultMasterKey: ctx.values.protectedEnrollmentVaultMasterKey,
          authorizedByDeviceId: ctx.values.deviceId,
          authorizerSignature:
            ctx.values.deviceEnrollmentAuthorizationSignature,
        },
      },
      content: ctx.values.encryptedVault,
      signature: ctx.values.snapshotSignature,
    };

    ctx.saved.unlockedVaultSession = {
      ...session!,
      unlockedVault: {
        ...session!.unlockedVault,
        vault: {
          ...session!.unlockedVault.vault,
          deviceProfiles: [
            ...session!.unlockedVault.vault.deviceProfiles,
            {
              id: otherDeviceId,
              name: "Other laptop",
              createdAt: ctx.values.timestamp - 1,
              versionVector: {
                [otherDeviceId]: 1,
              },
            },
          ],
        },
      },
    };
    vi.mocked(
      ctx.vaultSnapshot.requireCurrentSnapshotForUnlockedVault,
    ).mockResolvedValueOnce(localSnapshot);

    await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
    });

    expect(ctx.ports.syncProvider.removeVaultSnapshots).toHaveBeenCalledWith(
      ctx.values.syncConfig,
      ctx.values.vaultId,
    );
    expect(
      ctx.saved.unlockedVaultSession?.unlockedVault.vault.syncConfig,
    ).toBeUndefined();
    expect(ctx.saved.unlockedVaultSession?.sourceSnapshotVersionVector).toEqual(
      {
        [ctx.values.deviceId]: 2,
      },
    );

    const persistedUnlockedVault = vi.mocked(
      ctx.vaultSnapshot.persistUnlockedVault,
    ).mock.calls[0]?.[1];
    const sourceSnapshotVersionVector = vi.mocked(
      ctx.vaultSnapshot.persistUnlockedVault,
    ).mock.calls[0]?.[2];

    expect(persistedUnlockedVault).toBeDefined();
    expect("syncConfig" in persistedUnlockedVault!.vault).toBe(false);
    expect(persistedUnlockedVault!.vault.versionVector).toEqual({
      [ctx.values.deviceId]: 2,
    });
    expect(persistedUnlockedVault!.vault.deviceProfiles).toEqual([
      {
        id: ctx.values.deviceId,
        name: "Current laptop",
        createdAt: ctx.values.timestamp - 1,
        versionVector: {
          [ctx.values.deviceId]: 1,
        },
      },
    ]);
    expect(persistedUnlockedVault!.vault.deletedDeviceProfiles).toEqual([
      {
        id: otherDeviceId,
        versionVector: {
          [otherDeviceId]: 1,
          [ctx.values.deviceId]: 1,
        },
        deletedAt: ctx.values.timestamp,
      },
    ]);
    expect(sourceSnapshotVersionVector).toEqual({
      [ctx.values.deviceId]: 1,
    });
    expect(
      ctx.vaultSnapshot.requireCurrentSnapshotForUnlockedVault,
    ).toHaveBeenCalledWith(
      ctx.values.vaultId,
      persistedUnlockedVault,
      sourceSnapshotVersionVector,
    );
    expect(
      vi.mocked(ctx.vaultSnapshot.persistUnlockedVault).mock.calls[0]?.[3],
    ).toEqual({
      keySlots: {
        deviceSlots: [currentDeviceSlot],
        completedEnrollments: undefined,
      },
    });
    expect(
      vi.mocked(ctx.vaultSnapshot.requireCurrentSnapshotForUnlockedVault).mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(ctx.ports.syncProvider.removeVaultSnapshots).mock
        .invocationCallOrder[0],
    );
    expect(
      vi.mocked(ctx.ports.syncProvider.removeVaultSnapshots).mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(ctx.vaultSnapshot.persistUnlockedVault).mock
        .invocationCallOrder[0],
    );
    expect(
      vi.mocked(ctx.vaultSnapshot.persistUnlockedVault).mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(ctx.ports.sessionServices.unlockedVaultSession.commit).mock
        .invocationCallOrder[0],
    );
  });

  it("fails when the target vault is not unlocked", async () => {
    const ctx = createContext();
    ctx.saved.unlockedVaultSession = undefined;

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
      }),
    ).rejects.toBeInstanceOf(VaultMustBeUnlockedError);

    expect(ctx.ports.syncProvider.removeVaultSnapshots).not.toHaveBeenCalled();
    expect(ctx.vaultSnapshot.persistUnlockedVault).not.toHaveBeenCalled();
  });

  it("fails when sync is not configured", async () => {
    const ctx = createContext(false);

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
      }),
    ).rejects.toBeInstanceOf(SyncNotConfiguredError);

    expect(ctx.ports.syncProvider.removeVaultSnapshots).not.toHaveBeenCalled();
    expect(ctx.vaultSnapshot.persistUnlockedVault).not.toHaveBeenCalled();
  });

  it("does not remove remote snapshots when local snapshot preflight fails", async () => {
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
      }),
    ).rejects.toBe(error);

    expect(ctx.ports.syncProvider.removeVaultSnapshots).not.toHaveBeenCalled();
    expect(ctx.vaultSnapshot.persistUnlockedVault).not.toHaveBeenCalled();
    expect(
      ctx.ports.sessionServices.unlockedVaultSession.commit,
    ).not.toHaveBeenCalled();
    expect(ctx.saved.unlockedVaultSession?.unlockedVault.vault.syncConfig).toBe(
      ctx.values.syncConfig,
    );
  });

  it("does not remove remote snapshots when remote is ahead", async () => {
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
      }),
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotAheadError);

    expect(ctx.ports.syncProvider.removeVaultSnapshots).not.toHaveBeenCalled();
    expect(ctx.vaultSnapshot.persistUnlockedVault).not.toHaveBeenCalled();
    expect(
      ctx.ports.sessionServices.unlockedVaultSession.commit,
    ).not.toHaveBeenCalled();
    expect(ctx.saved.unlockedVaultSession?.unlockedVault.vault.syncConfig).toBe(
      ctx.values.syncConfig,
    );
  });

  it("does not remove remote snapshots when local and remote snapshots are broken", async () => {
    const ctx = createContext();

    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce({
      vaultId: ctx.values.vaultId,
      snapshotVersionVector: {
        [ctx.values.deviceId]: 0,
        "remote-device-id": 1,
      },
      revisionTimestamp: ctx.values.timestamp + 1,
    });

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
      }),
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotIntegrityError);

    expect(ctx.ports.syncProvider.removeVaultSnapshots).not.toHaveBeenCalled();
    expect(ctx.vaultSnapshot.persistUnlockedVault).not.toHaveBeenCalled();
    expect(
      ctx.ports.sessionServices.unlockedVaultSession.commit,
    ).not.toHaveBeenCalled();
    expect(ctx.saved.unlockedVaultSession?.unlockedVault.vault.syncConfig).toBe(
      ctx.values.syncConfig,
    );
  });

  it("does not remove remote snapshots when equal vectors have different descriptors", async () => {
    const ctx = createContext();

    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce({
      vaultId: ctx.values.vaultId,
      snapshotVersionVector: {
        [ctx.values.deviceId]: 1,
      },
      revisionTimestamp: ctx.values.timestamp + 1,
    });

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
      }),
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotIntegrityError);

    expect(ctx.ports.syncProvider.removeVaultSnapshots).not.toHaveBeenCalled();
    expect(ctx.vaultSnapshot.persistUnlockedVault).not.toHaveBeenCalled();
    expect(
      ctx.ports.sessionServices.unlockedVaultSession.commit,
    ).not.toHaveBeenCalled();
    expect(ctx.saved.unlockedVaultSession?.unlockedVault.vault.syncConfig).toBe(
      ctx.values.syncConfig,
    );
  });

  it("does not remove local sync config when remote removal fails", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.syncProvider.removeVaultSnapshots,
    ).mockRejectedValueOnce(new Error("remove failed"));

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
      }),
    ).rejects.toThrow("remove failed");

    expect(ctx.vaultSnapshot.persistUnlockedVault).not.toHaveBeenCalled();
    expect(ctx.saved.unlockedVaultSession?.unlockedVault.vault.syncConfig).toBe(
      ctx.values.syncConfig,
    );
  });

  it("does not update the session when local snapshot persistence fails", async () => {
    const ctx = createContext();
    vi.mocked(ctx.vaultSnapshot.persistUnlockedVault).mockRejectedValueOnce(
      new Error("persist failed"),
    );

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
      }),
    ).rejects.toThrow("persist failed");

    expect(ctx.ports.syncProvider.removeVaultSnapshots).toHaveBeenCalled();
    expect(
      ctx.ports.sessionServices.unlockedVaultSession.commit,
    ).not.toHaveBeenCalled();
    expect(ctx.saved.unlockedVaultSession?.unlockedVault.vault.syncConfig).toBe(
      ctx.values.syncConfig,
    );
  });
});
