import { describe, expect, it } from "vitest";
import type { PasswordEntry } from "../../domain/entry/password-entry.type";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import { VaultMustBeUnlockedError } from "../__errors/vault-session.errors";
import { SearchEntriesUseCase } from "./search-entries";

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
    useCase: new SearchEntriesUseCase(ports.unlockedVaultRepository),
  };
}

describe("SearchEntriesUseCase", () => {
  it("searches entry metadata without exposing passwords", async () => {
    const ctx = createContext();

    const result = await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      query: "service",
    });

    expect(result.entries).toEqual([
      {
        id: secondEntry.id,
        login: secondEntry.login,
        tags: secondEntry.tags,
        sanitizedUrl: secondEntry.sanitizedUrl,
      },
    ]);
    expect(result.entries[0]).not.toHaveProperty("password");
  });

  it("returns all entry metadata when search query is empty", async () => {
    const ctx = createContext();

    const result = await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      query: " ",
    });

    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).not.toHaveProperty("password");
    expect(result.entries[1]).not.toHaveProperty("password");
  });

  it("fails when the target vault is not unlocked", async () => {
    const ctx = createContext();
    ctx.saved.unlockedVault = undefined;

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        query: "example",
      }),
    ).rejects.toBeInstanceOf(VaultMustBeUnlockedError);
  });
});
