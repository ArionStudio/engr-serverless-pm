import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import {
  createVaultSnapshotServiceMock,
  createUnlockedVaultWithEntries,
} from "../../__tests__/fixtures/vault-entries";
import { InvalidSyncConfigError } from "../../application/errors/sync.errors";
import { VaultMustBeUnlockedError } from "../../application/errors/vault-session.errors";
import { SetupSyncUseCase } from "./setup-sync";

function createContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  const vaultSnapshot = createVaultSnapshotServiceMock(values);
  const unlockedVault = createUnlockedVaultWithEntries(values, []);

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
    useCase: new SetupSyncUseCase(
      ports.syncProvider,
      ports.sessionServices.unlockedVaultSession,
      vaultSnapshot,
    ),
  };
}

describe("SetupSyncUseCase", () => {
  it("stores normalized sync config in the unlocked vault and persists a new snapshot", async () => {
    const ctx = createContext();

    await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      syncConfig: ctx.values.syncConfigInput,
    });

    expect(ctx.ports.syncProvider.setup).toHaveBeenCalledWith(
      ctx.values.syncConfigInput,
    );
    expect(
      ctx.saved.unlockedVaultSession?.unlockedVault.vault.syncConfig,
    ).toEqual(ctx.values.syncConfig);
    expect(ctx.saved.unlockedVaultSession?.sourceSnapshotRevision).toBe(2);
    expect(ctx.vaultSnapshot.persistUnlockedVault).toHaveBeenCalledWith(
      ctx.values.vaultId,
      expect.objectContaining({
        vault: expect.objectContaining({
          syncConfig: ctx.values.syncConfig,
        }),
      }),
    );
    expect(
      vi.mocked(ctx.ports.syncProvider.setup).mock.invocationCallOrder[0],
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
        syncConfig: ctx.values.syncConfigInput,
      }),
    ).rejects.toBeInstanceOf(VaultMustBeUnlockedError);

    expect(ctx.ports.syncProvider.setup).not.toHaveBeenCalled();
    expect(ctx.vaultSnapshot.persistUnlockedVault).not.toHaveBeenCalled();
  });

  it("fails when sync provider setup fails", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.syncProvider.setup).mockRejectedValueOnce(
      new Error("invalid provider config"),
    );

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        syncConfig: ctx.values.syncConfigInput,
      }),
    ).rejects.toBeInstanceOf(InvalidSyncConfigError);

    expect(ctx.vaultSnapshot.persistUnlockedVault).not.toHaveBeenCalled();
    expect(
      ctx.ports.sessionServices.unlockedVaultSession.commit,
    ).not.toHaveBeenCalled();
    expect(
      ctx.saved.unlockedVaultSession?.unlockedVault.vault.syncConfig,
    ).toBeUndefined();
  });

  it("does not save the session vault when snapshot persistence fails", async () => {
    const ctx = createContext();
    vi.mocked(ctx.vaultSnapshot.persistUnlockedVault).mockRejectedValueOnce(
      new Error("persist failed"),
    );

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        syncConfig: ctx.values.syncConfigInput,
      }),
    ).rejects.toThrow("persist failed");

    expect(
      ctx.ports.sessionServices.unlockedVaultSession.commit,
    ).not.toHaveBeenCalled();
    expect(
      ctx.saved.unlockedVaultSession?.unlockedVault.vault.syncConfig,
    ).toBeUndefined();
  });

  it("bubbles the session commit failure after snapshot persistence", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.sessionServices.unlockedVaultSession.commit,
    ).mockRejectedValueOnce(new Error("session save failed"));

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        syncConfig: ctx.values.syncConfigInput,
      }),
    ).rejects.toThrow("session save failed");

    expect(ctx.vaultSnapshot.persistUnlockedVault).toHaveBeenCalled();
  });

  it("preserves the session commit error", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.sessionServices.unlockedVaultSession.commit,
    ).mockRejectedValueOnce(new Error("session save failed"));

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        syncConfig: ctx.values.syncConfigInput,
      }),
    ).rejects.toThrow("session save failed");
  });
});
