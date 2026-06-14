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
import { RemoveCloudSyncFilesUseCase } from "./remove-cloud-sync-files";

function createContext(syncConfigured = true) {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  const vaultSnapshot = createVaultSnapshotServiceMock(values);
  const unlockedVault = {
    ...createUnlockedVaultWithEntries(values, []),
    vault: {
      ...values.decryptedVault,
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
    useCase: new RemoveCloudSyncFilesUseCase(
      ports.syncProvider,
      ports.sessionServices.unlockedVaultSession,
      vaultSnapshot,
    ),
  };
}

describe("RemoveCloudSyncFilesUseCase", () => {
  it("removes remote vault snapshots using the unlocked vault sync config", async () => {
    const ctx = createContext();

    await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
    });

    expect(ctx.ports.syncProvider.removeVaultSnapshots).toHaveBeenCalledWith(
      ctx.values.syncConfig,
      ctx.values.vaultId,
    );
    expect(ctx.saved.unlockedVaultSession?.unlockedVault.vault.syncConfig).toBe(
      ctx.values.syncConfig,
    );
    expect(
      ctx.ports.sessionServices.unlockedVaultSession.commit,
    ).not.toHaveBeenCalled();
    expect(
      ctx.vaultSnapshot.requireCurrentSnapshotForUnlockedVault,
    ).toHaveBeenCalledWith(
      ctx.values.vaultId,
      ctx.saved.unlockedVaultSession?.unlockedVault,
      {
        [ctx.values.deviceId]: 1,
      },
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
  });

  it("fails when sync is not configured", async () => {
    const ctx = createContext(false);

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
      }),
    ).rejects.toBeInstanceOf(SyncNotConfiguredError);

    expect(ctx.ports.syncProvider.removeVaultSnapshots).not.toHaveBeenCalled();
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

    expect(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.removeVaultSnapshots).not.toHaveBeenCalled();
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
  });

  it("bubbles provider removal failures without removing local sync config", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.syncProvider.removeVaultSnapshots,
    ).mockRejectedValueOnce(new Error("remove failed"));

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
      }),
    ).rejects.toThrow("remove failed");

    expect(ctx.saved.unlockedVaultSession?.unlockedVault.vault.syncConfig).toBe(
      ctx.values.syncConfig,
    );
    expect(
      ctx.ports.sessionServices.unlockedVaultSession.commit,
    ).not.toHaveBeenCalled();
  });
});
