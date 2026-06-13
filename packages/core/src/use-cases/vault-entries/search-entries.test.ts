import { describe, expect, it } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import {
  saveUnlockedVaultWithEntries,
  secondPasswordEntry,
  standardPasswordEntries,
  standardVaultTags,
} from "../../__tests__/fixtures/vault-entries";
import type { SearchEntryQuery } from "../../domain/entry/search-entry-query.type";
import { InvalidSearchEntryQueryError } from "../../errors/vault-entry.errors";
import { VaultMustBeUnlockedError } from "../../errors/vault-session.errors";
import { SearchEntriesUseCase } from "./search-entries";

function createContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);

  saveUnlockedVaultWithEntries(
    ports,
    values,
    standardPasswordEntries,
    standardVaultTags,
  );

  return {
    values,
    ports,
    saved: ports.saved,
    useCase: new SearchEntriesUseCase(
      ports.sessionServices.unlockedVaultSession,
    ),
  };
}

describe("SearchEntriesUseCase", () => {
  it("searches entry metadata without exposing passwords", async () => {
    const ctx = createContext();

    const result = await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      query: {
        mode: "any",
        value: "service",
      },
    });

    expect(result.entries).toEqual([
      {
        id: secondPasswordEntry.id,
        login: secondPasswordEntry.login,
        tags: secondPasswordEntry.tags,
        sanitizedUrl: secondPasswordEntry.sanitizedUrl,
      },
    ]);
    expect(result.entries[0]).not.toHaveProperty("password");
  });

  it("returns all entry metadata when search query is empty", async () => {
    const ctx = createContext();

    const result = await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      query: {
        mode: "any",
        value: " ",
      },
    });

    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).not.toHaveProperty("password");
    expect(result.entries[1]).not.toHaveProperty("password");
  });

  it("searches tag names in any mode", async () => {
    const ctx = createContext();

    const result = await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      query: {
        mode: "any",
        value: "personal",
      },
    });

    expect(result.entries).toEqual([
      {
        id: secondPasswordEntry.id,
        login: secondPasswordEntry.login,
        tags: secondPasswordEntry.tags,
        sanitizedUrl: secondPasswordEntry.sanitizedUrl,
      },
    ]);
  });

  it("fails with a domain error when search query validation fails", async () => {
    const ctx = createContext();

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        query: {
          mode: "fields",
          login: "",
          url: "",
          tag: ["personal"],
        } as unknown as SearchEntryQuery,
      }),
    ).rejects.toBeInstanceOf(InvalidSearchEntryQueryError);
  });

  it("fails when the target vault is not unlocked", async () => {
    const ctx = createContext();
    ctx.saved.unlockedVaultSession = undefined;

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        query: {
          mode: "any",
          value: "example",
        },
      }),
    ).rejects.toBeInstanceOf(VaultMustBeUnlockedError);
  });
});
