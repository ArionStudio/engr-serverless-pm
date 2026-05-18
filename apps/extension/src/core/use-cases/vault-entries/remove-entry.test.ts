import { describe, expect, it, vi } from "vitest";
import type { PasswordEntry } from "../../domain/entry/password-entry.type";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import { PasswordEntryNotFoundError } from "../__errors/vault-entry.errors";
import { VaultMustBeUnlockedError } from "../__errors/vault-session.errors";
import type { PersistUnlockedVaultUseCase } from "../vault-snapshots/persist-unlocked-vault";
import { RemoveEntryUseCase } from "./remove-entry";

const firstEntry: PasswordEntry = {
  id: "entry-1",
  password: "first-password",
  login: "first@example.com",
  tags: [1],
  sanitizedUrl: "https://example.com/login",
};

const secondEntry: PasswordEntry = {
  id: "entry-2",
  password: "second-password",
  login: "second@example.com",
  tags: [2],
  sanitizedUrl: "https://service.example.com/account",
};

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

  ports.saved.unlockedVault = {
    vaultId: values.vaultId,
    deviceId: values.deviceId,
    vault: {
      ...values.decryptedVault,
      entries: [firstEntry, secondEntry],
    },
    vaultMasterKey: values.vaultMasterKey,
    devicePrivateSignKey: values.devicePrivateSignKey,
  };

  return {
    values,
    ports,
    saved: ports.saved,
    persistUnlockedVault,
    useCase: new RemoveEntryUseCase(
      ports.unlockedVaultRepository,
      persistUnlockedVault,
    ),
  };
}

describe("RemoveEntryUseCase", () => {
  it("removes an entry from session vault and persists a new snapshot", async () => {
    const ctx = createContext();

    const result = await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      entryId: firstEntry.id,
    });

    expect(result).toEqual({
      entryId: firstEntry.id,
      revision: 2,
      revisionTimestamp: ctx.values.timestamp + 1,
      deviceId: ctx.values.deviceId,
    });
    expect(ctx.saved.unlockedVault?.vault.entries).toEqual([secondEntry]);
    expect(ctx.persistUnlockedVault.execute).toHaveBeenCalledWith({
      vaultId: ctx.values.vaultId,
    });
  });

  it("fails when the target vault is not unlocked", async () => {
    const ctx = createContext();
    ctx.saved.unlockedVault = undefined;

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entryId: firstEntry.id,
      }),
    ).rejects.toBeInstanceOf(VaultMustBeUnlockedError);
  });

  it("fails when requested entry does not exist", async () => {
    const ctx = createContext();

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entryId: "missing-entry",
      }),
    ).rejects.toBeInstanceOf(PasswordEntryNotFoundError);

    expect(
      ctx.ports.unlockedVaultRepository.saveUnlockedVault,
    ).not.toHaveBeenCalled();
    expect(ctx.persistUnlockedVault.execute).not.toHaveBeenCalled();
  });
});
