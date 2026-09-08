import { describe, it, expect } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import {
  saveUnlockedVaultWithEntries,
  singlePasswordEntry,
  workTag,
} from "../../__tests__/fixtures/vault-entries";
import { VaultMustBeUnlockedError } from "../../errors/vault-session.errors";
import { PasswordEntryNotFoundError } from "../../errors/vault-entry.errors";
import { ReadEntryForEditingUseCase } from "./read-entry-for-editing";
import { ReadVaultWorkspaceUseCase } from "./read-vault-workspace";
function context() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  saveUnlockedVaultWithEntries(
    ports,
    values,
    [structuredClone(singlePasswordEntry)],
    [structuredClone(workTag)],
  );
  return {
    values,
    ports,
    edit: new ReadEntryForEditingUseCase(
      ports.sessionServices.unlockedVaultSession,
    ),
    workspace: new ReadVaultWorkspaceUseCase(
      ports.sessionServices.unlockedVaultSession,
    ),
  };
}
describe("workspace reads", () => {
  it("projects public entry/tag data and returns a separate explicit versioned secret for editing", async () => {
    const ctx = context();
    const params = {
      vaultId: ctx.values.vaultId,
      entryId: singlePasswordEntry.id,
    };
    const visible = await ctx.workspace.execute(params);
    expect(visible.entries[0]).not.toHaveProperty("password");
    expect(visible.tags).toEqual([{ id: 1, name: "Work" }]);
    expect(visible.syncConfigured).toBe(false);
    const first = await ctx.edit.execute(params);
    expect(first.entry).toEqual(singlePasswordEntry);
    first.entry.password = "changed";
    first.entry.tags.push(99);
    first.entry.versionVector["device-id"] = 99;
    expect((await ctx.edit.execute(params)).entry).toEqual(singlePasswordEntry);
  });
  it("rejects a missing entry and both reads after locking", async () => {
    const ctx = context();
    await expect(
      ctx.edit.execute({ vaultId: ctx.values.vaultId, entryId: "missing" }),
    ).rejects.toBeInstanceOf(PasswordEntryNotFoundError);
    ctx.ports.saved.unlockedVaultSession = undefined;
    await expect(
      ctx.edit.execute({
        vaultId: ctx.values.vaultId,
        entryId: singlePasswordEntry.id,
      }),
    ).rejects.toBeInstanceOf(VaultMustBeUnlockedError);
    await expect(
      ctx.workspace.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(VaultMustBeUnlockedError);
  });
});
