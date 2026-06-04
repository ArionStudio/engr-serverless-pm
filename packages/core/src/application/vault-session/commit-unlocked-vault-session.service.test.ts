import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import { createUnlockedVaultWithEntries } from "../../__tests__/fixtures/vault-entries";
import {
  ActiveUnlockedVaultMismatchError,
  UnlockedVaultSessionInvalidError,
} from "../../use-cases/__errors/vault-session.errors";
import { CommitUnlockedVaultSessionService } from "./commit-unlocked-vault-session.service";

function createContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  const unlockedVault = createUnlockedVaultWithEntries(values, []);

  return {
    ports,
    values,
    unlockedVault,
    service: new CommitUnlockedVaultSessionService(
      ports.sessionServices.saveUnlockedVaultSession,
      ports.sessionServices.removeUnlockedVaultSession,
    ),
  };
}

describe("CommitUnlockedVaultSessionService", () => {
  it("saves the unlocked vault session without cleanup", async () => {
    const ctx = createContext();

    await ctx.service.commit(ctx.unlockedVault, 7);

    expect(
      ctx.ports.sessionServices.saveUnlockedVaultSession.save,
    ).toHaveBeenCalledWith({
      unlockedVault: ctx.unlockedVault,
      sourceSnapshotRevision: 7,
    });
    expect(
      ctx.ports.sessionServices.removeUnlockedVaultSession.remove,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.saved.unlockedVaultSession).toEqual({
      unlockedVault: ctx.unlockedVault,
      sourceSnapshotRevision: 7,
    });
  });

  it("clears the unlocked vault session after a generic commit failure", async () => {
    const ctx = createContext();
    const error = new Error("session save failed");

    vi.mocked(
      ctx.ports.sessionServices.saveUnlockedVaultSession.save,
    ).mockRejectedValueOnce(error);

    await expect(ctx.service.commit(ctx.unlockedVault, 7)).rejects.toBe(error);

    expect(
      ctx.ports.sessionServices.removeUnlockedVaultSession.remove,
    ).toHaveBeenCalled();
  });

  it("does not clear the active session after a cross-vault save violation", async () => {
    const ctx = createContext();
    const error = new ActiveUnlockedVaultMismatchError(
      ctx.values.vaultId,
      "other-vault",
    );

    vi.mocked(
      ctx.ports.sessionServices.saveUnlockedVaultSession.save,
    ).mockRejectedValueOnce(error);

    await expect(ctx.service.commit(ctx.unlockedVault, 7)).rejects.toBe(error);

    expect(
      ctx.ports.sessionServices.removeUnlockedVaultSession.remove,
    ).not.toHaveBeenCalled();
  });

  it("clears the active session after an invalid-session save error", async () => {
    const ctx = createContext();
    const error = new UnlockedVaultSessionInvalidError("payload mismatch");

    vi.mocked(
      ctx.ports.sessionServices.saveUnlockedVaultSession.save,
    ).mockRejectedValueOnce(error);

    await expect(ctx.service.commit(ctx.unlockedVault, 7)).rejects.toBe(error);

    expect(
      ctx.ports.sessionServices.removeUnlockedVaultSession.remove,
    ).toHaveBeenCalled();
  });

  it("preserves the session commit error when cleanup also fails", async () => {
    const ctx = createContext();
    const error = new Error("session save failed");

    vi.mocked(
      ctx.ports.sessionServices.saveUnlockedVaultSession.save,
    ).mockRejectedValueOnce(error);
    vi.mocked(
      ctx.ports.sessionServices.removeUnlockedVaultSession.remove,
    ).mockRejectedValueOnce(new Error("cleanup failed"));

    await expect(ctx.service.commit(ctx.unlockedVault, 7)).rejects.toBe(error);
  });
});
