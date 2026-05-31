import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import {
  createPersistUnlockedVaultUseCaseMock,
  createUnlockedVaultWithEntries,
} from "../../__tests__/fixtures/vault-entries";
import { InvalidSyncConfigError } from "../__errors/sync.errors";
import { VaultMustBeUnlockedError } from "../__errors/vault-session.errors";
import { SetupSyncUseCase } from "./setup-sync";

function createContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  const persistUnlockedVault = createPersistUnlockedVaultUseCaseMock(values);
  const unlockedVault = createUnlockedVaultWithEntries(values, []);

  ports.saved.unlockedVault = unlockedVault;

  return {
    values,
    ports,
    saved: ports.saved,
    persistUnlockedVault,
    unlockedVault,
    useCase: new SetupSyncUseCase(
      ports.syncProvider,
      ports.unlockedVaultRepository,
      persistUnlockedVault,
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
    expect(ctx.saved.unlockedVault?.vault.syncConfig).toEqual(
      ctx.values.syncConfig,
    );
    expect(ctx.persistUnlockedVault.execute).toHaveBeenCalledWith({
      vaultId: ctx.values.vaultId,
      unlockedVault: expect.objectContaining({
        vault: expect.objectContaining({
          syncConfig: ctx.values.syncConfig,
        }),
      }),
    });
    expect(
      vi.mocked(ctx.ports.syncProvider.setup).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(ctx.persistUnlockedVault.execute).mock.invocationCallOrder[0],
    );
    expect(
      vi.mocked(ctx.persistUnlockedVault.execute).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(ctx.ports.unlockedVaultRepository.saveUnlockedVault).mock
        .invocationCallOrder[0],
    );
  });

  it("fails when the target vault is not unlocked", async () => {
    const ctx = createContext();
    ctx.saved.unlockedVault = undefined;

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        syncConfig: ctx.values.syncConfigInput,
      }),
    ).rejects.toBeInstanceOf(VaultMustBeUnlockedError);

    expect(ctx.ports.syncProvider.setup).not.toHaveBeenCalled();
    expect(ctx.persistUnlockedVault.execute).not.toHaveBeenCalled();
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

    expect(ctx.persistUnlockedVault.execute).not.toHaveBeenCalled();
    expect(
      ctx.ports.unlockedVaultRepository.saveUnlockedVault,
    ).not.toHaveBeenCalled();
    expect(ctx.saved.unlockedVault?.vault.syncConfig).toBeUndefined();
  });

  it("does not save the session vault when snapshot persistence fails", async () => {
    const ctx = createContext();
    vi.mocked(ctx.persistUnlockedVault.execute).mockRejectedValueOnce(
      new Error("persist failed"),
    );

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        syncConfig: ctx.values.syncConfigInput,
      }),
    ).rejects.toThrow("persist failed");

    expect(
      ctx.ports.unlockedVaultRepository.saveUnlockedVault,
    ).not.toHaveBeenCalled();
    expect(ctx.saved.unlockedVault?.vault.syncConfig).toBeUndefined();
  });

  it("clears the session vault when session save fails after snapshot persistence", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.unlockedVaultRepository.saveUnlockedVault,
    ).mockRejectedValueOnce(new Error("session save failed"));

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        syncConfig: ctx.values.syncConfigInput,
      }),
    ).rejects.toThrow("session save failed");

    expect(ctx.persistUnlockedVault.execute).toHaveBeenCalled();
    expect(
      ctx.ports.unlockedVaultRepository.removeUnlockedVault,
    ).toHaveBeenCalled();
    expect(ctx.saved.unlockedVault).toBeUndefined();
  });

  it("preserves the session save error when cleanup also fails", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.unlockedVaultRepository.saveUnlockedVault,
    ).mockRejectedValueOnce(new Error("session save failed"));
    vi.mocked(
      ctx.ports.unlockedVaultRepository.removeUnlockedVault,
    ).mockRejectedValueOnce(new Error("cleanup failed"));

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        syncConfig: ctx.values.syncConfigInput,
      }),
    ).rejects.toThrow("session save failed");
  });
});
