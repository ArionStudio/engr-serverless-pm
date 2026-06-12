import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import {
  createUnlockedVaultWithEntries,
  createVaultSnapshotServiceMock,
} from "../../__tests__/fixtures/vault-entries";
import { SyncNotConfiguredError } from "../../application/errors/sync.errors";
import { VaultMustBeUnlockedError } from "../../application/errors/vault-session.errors";
import { RemoveLocalSyncCredentialsUseCase } from "./remove-local-sync-credentials";

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
    unlockedVault,
    useCase: new RemoveLocalSyncCredentialsUseCase(
      ports.sessionServices.unlockedVaultSession,
      vaultSnapshot,
    ),
  };
}

describe("RemoveLocalSyncCredentialsUseCase", () => {
  it("removes sync config from the unlocked vault and persists a new snapshot", async () => {
    const ctx = createContext();

    await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
    });

    expect(
      ctx.saved.unlockedVaultSession?.unlockedVault.vault.syncConfig,
    ).toBeUndefined();
    expect(ctx.saved.unlockedVaultSession?.sourceSnapshotRevision).toBe(2);
    expect(ctx.vaultSnapshot.persistUnlockedVault).toHaveBeenCalledWith(
      ctx.values.vaultId,
      expect.objectContaining({}),
    );
    const persistedUnlockedVault = vi.mocked(
      ctx.vaultSnapshot.persistUnlockedVault,
    ).mock.calls[0]?.[1];

    expect(persistedUnlockedVault).toBeDefined();
    expect("syncConfig" in persistedUnlockedVault!.vault).toBe(false);
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

    expect(ctx.vaultSnapshot.persistUnlockedVault).not.toHaveBeenCalled();
  });

  it("fails when sync is not configured", async () => {
    const ctx = createContext(false);

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
      }),
    ).rejects.toBeInstanceOf(SyncNotConfiguredError);

    expect(ctx.vaultSnapshot.persistUnlockedVault).not.toHaveBeenCalled();
    expect(
      ctx.ports.sessionServices.unlockedVaultSession.commit,
    ).not.toHaveBeenCalled();
  });

  it("does not update the session when snapshot persistence fails", async () => {
    const ctx = createContext();
    vi.mocked(ctx.vaultSnapshot.persistUnlockedVault).mockRejectedValueOnce(
      new Error("persist failed"),
    );

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
      }),
    ).rejects.toThrow("persist failed");

    expect(
      ctx.ports.sessionServices.unlockedVaultSession.commit,
    ).not.toHaveBeenCalled();
    expect(ctx.saved.unlockedVaultSession?.unlockedVault.vault.syncConfig).toBe(
      ctx.values.syncConfig,
    );
  });

  it("bubbles the session commit failure after snapshot persistence", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.sessionServices.unlockedVaultSession.commit,
    ).mockRejectedValueOnce(new Error("session save failed"));

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
      }),
    ).rejects.toThrow("session save failed");

    expect(ctx.vaultSnapshot.persistUnlockedVault).toHaveBeenCalled();
  });
});
