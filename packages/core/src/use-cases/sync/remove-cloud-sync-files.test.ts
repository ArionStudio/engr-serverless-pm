import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import { createUnlockedVaultWithEntries } from "../../__tests__/fixtures/vault-entries";
import { SyncNotConfiguredError } from "../../application/errors/sync.errors";
import { VaultMustBeUnlockedError } from "../../application/errors/vault-session.errors";
import { RemoveCloudSyncFilesUseCase } from "./remove-cloud-sync-files";

function createContext(syncConfigured = true) {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
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
    useCase: new RemoveCloudSyncFilesUseCase(
      ports.syncProvider,
      ports.sessionServices.unlockedVaultSession,
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
