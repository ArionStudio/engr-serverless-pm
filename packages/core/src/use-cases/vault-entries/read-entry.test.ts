import { describe, expect, it } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import {
  saveUnlockedVaultWithEntries,
  singlePasswordEntry,
} from "../../__tests__/fixtures/vault-entries";
import { PasswordEntryNotFoundError } from "../../errors/vault-entry.errors";
import { VaultMustBeUnlockedError } from "../../errors/vault-session.errors";
import { ReadEntryUseCase } from "./read-entry";

function createContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);

  saveUnlockedVaultWithEntries(ports, values, [singlePasswordEntry]);

  return {
    values,
    ports,
    saved: ports.saved,
    useCase: new ReadEntryUseCase(ports.sessionServices.unlockedVaultSession),
  };
}

describe("ReadEntryUseCase", () => {
  it("reads entry metadata without exposing the password", async () => {
    const ctx = createContext();

    const result = await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      entryId: singlePasswordEntry.id,
    });

    expect(result).toEqual({
      entry: {
        id: singlePasswordEntry.id,
        login: singlePasswordEntry.login,
        tags: singlePasswordEntry.tags,
        sanitizedUrl: singlePasswordEntry.sanitizedUrl,
      },
    });
    expect(result.entry).not.toHaveProperty("password");
  });

  it("fails when the target vault is not unlocked", async () => {
    const ctx = createContext();
    ctx.saved.unlockedVaultSession = undefined;

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entryId: singlePasswordEntry.id,
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
  });
});
