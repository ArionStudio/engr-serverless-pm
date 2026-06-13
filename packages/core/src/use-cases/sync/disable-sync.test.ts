import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import {
  createUnlockedVaultWithEntries,
  createVaultSnapshotServiceMock,
} from "../../__tests__/fixtures/vault-entries";
import { SyncNotConfiguredError } from "../../application/errors/sync.errors";
import { VaultMustBeUnlockedError } from "../../application/errors/vault-session.errors";
import { VaultSnapshotRevisionMismatchError } from "../../application/errors/vault-snapshot.errors";
import { DisableSyncUseCase } from "./disable-sync";

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
    sourceSnapshotRevision: 1,
  };

  return {
    values,
    ports,
    saved: ports.saved,
    vaultSnapshot,
    useCase: new DisableSyncUseCase(
      ports.syncProvider,
      ports.sessionServices.unlockedVaultSession,
      vaultSnapshot,
    ),
  };
}

describe("DisableSyncUseCase", () => {
  it("removes remote snapshots and then removes local sync config", async () => {
    const ctx = createContext();

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
    expect(ctx.saved.unlockedVaultSession?.sourceSnapshotRevision).toBe(2);

    const persistedUnlockedVault = vi.mocked(
      ctx.vaultSnapshot.persistUnlockedVault,
    ).mock.calls[0]?.[1];
    const sourceSnapshotRevision = vi.mocked(
      ctx.vaultSnapshot.persistUnlockedVault,
    ).mock.calls[0]?.[2];

    expect(persistedUnlockedVault).toBeDefined();
    expect("syncConfig" in persistedUnlockedVault!.vault).toBe(false);
    expect(sourceSnapshotRevision).toBe(1);
    expect(
      ctx.vaultSnapshot.assertCanPersistUnlockedVault,
    ).toHaveBeenCalledWith(
      ctx.values.vaultId,
      persistedUnlockedVault,
      sourceSnapshotRevision,
    );
    expect(
      vi.mocked(ctx.vaultSnapshot.assertCanPersistUnlockedVault).mock
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
    const error = new VaultSnapshotRevisionMismatchError({
      vaultId: ctx.values.vaultId,
      expectedRevision: 1,
      actualRevision: 2,
    });

    vi.mocked(
      ctx.vaultSnapshot.assertCanPersistUnlockedVault,
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
