import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import { InvalidPasswordEntryError } from "../__errors/vault-entry.errors";
import { VaultMustBeUnlockedError } from "../__errors/vault-session.errors";
import { AddEntryUseCase } from "./add-entry";
import type { PersistUnlockedVaultUseCase } from "../vault-snapshots/persist-unlocked-vault";

function createContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  const persistUnlockedVault = {
    execute: vi.fn(async () => ({
      revision: 2,
      revisionTimestamp: values.timestamp + 1,
      deviceId: values.deviceId,
    })),
  } as unknown as PersistUnlockedVaultUseCase;

  vi.mocked(ports.ids.generateId).mockReset().mockResolvedValue("entry-id");

  ports.saved.unlockedVault = {
    vaultId: values.vaultId,
    deviceId: values.deviceId,
    vault: values.decryptedVault,
    vaultMasterKey: values.vaultMasterKey,
    devicePrivateSignKey: values.devicePrivateSignKey,
  };

  const useCase = new AddEntryUseCase(
    ports.ids,
    ports.unlockedVaultRepository,
    persistUnlockedVault,
  );

  return {
    values,
    ports,
    saved: ports.saved,
    persistUnlockedVault,
    useCase,
  };
}

describe("AddEntryUseCase", () => {
  it("adds a sanitized password entry to the unlocked vault and persists a new snapshot", async () => {
    const ctx = createContext();

    const result = await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      entry: {
        password: "secret-password",
        login: "user@example.com",
        tags: [1, 2],
        url: "https://example.com/login?session=secret#form",
      },
    });

    expect(result).toEqual({
      entryId: "entry-id",
      revision: 2,
      revisionTimestamp: ctx.values.timestamp + 1,
      deviceId: ctx.values.deviceId,
    });
    expect(ctx.saved.unlockedVault?.vault.entries).toEqual([
      {
        id: "entry-id",
        password: "secret-password",
        login: "user@example.com",
        tags: [1, 2],
        sanitizedUrl: "https://example.com/login",
      },
    ]);
    expect(ctx.persistUnlockedVault.execute).toHaveBeenCalledWith({
      vaultId: ctx.values.vaultId,
      unlockedVault: expect.objectContaining({
        vault: expect.objectContaining({
          entries: ctx.saved.unlockedVault?.vault.entries,
        }),
      }),
    });
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
        entry: {
          password: "secret-password",
          login: "user@example.com",
          tags: [],
          url: "https://example.com/login",
        },
      }),
    ).rejects.toBeInstanceOf(VaultMustBeUnlockedError);

    expect(ctx.ports.ids.generateId).not.toHaveBeenCalled();
    expect(
      ctx.ports.unlockedVaultRepository.saveUnlockedVault,
    ).not.toHaveBeenCalled();
    expect(ctx.persistUnlockedVault.execute).not.toHaveBeenCalled();
  });

  it("does not persist a snapshot when entry validation fails", async () => {
    const ctx = createContext();

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entry: {
          password: "",
          login: "user@example.com",
          tags: [],
          url: "https://example.com/login",
        },
      }),
    ).rejects.toBeInstanceOf(InvalidPasswordEntryError);

    expect(ctx.ports.ids.generateId).not.toHaveBeenCalled();
    expect(
      ctx.ports.unlockedVaultRepository.saveUnlockedVault,
    ).not.toHaveBeenCalled();
    expect(ctx.persistUnlockedVault.execute).not.toHaveBeenCalled();
  });

  it("does not save the session vault when snapshot persistence fails", async () => {
    const ctx = createContext();
    vi.mocked(ctx.persistUnlockedVault.execute).mockRejectedValueOnce(
      new Error("persist failed"),
    );

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entry: {
          password: "secret-password",
          login: "user@example.com",
          tags: [],
          url: "https://example.com/login",
        },
      }),
    ).rejects.toThrow("persist failed");

    expect(
      ctx.ports.unlockedVaultRepository.saveUnlockedVault,
    ).not.toHaveBeenCalled();
    expect(ctx.saved.unlockedVault?.vault.entries).toEqual([]);
  });
});
