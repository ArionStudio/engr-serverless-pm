import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import { createUnlockedVaultWithEntries } from "../../__tests__/fixtures/vault-entries";
import {
  ActiveUnlockedVaultMismatchError,
  UnlockedVaultSessionInvalidError,
} from "../__errors/vault-session.errors";
import { CommitUnlockedVaultSessionUseCase } from "./commit-unlocked-vault-session";

function createContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  const unlockedVault = createUnlockedVaultWithEntries(values, []);

  return {
    ports,
    values,
    unlockedVault,
    useCase: new CommitUnlockedVaultSessionUseCase(
      ports.sessionUseCases.saveUnlockedVaultSession,
      ports.sessionUseCases.removeUnlockedVaultSession,
    ),
  };
}

describe("CommitUnlockedVaultSessionUseCase", () => {
  it("saves the unlocked vault session without cleanup", async () => {
    const ctx = createContext();

    await ctx.useCase.execute({
      unlockedVault: ctx.unlockedVault,
      sourceSnapshotRevision: 7,
    });

    expect(
      ctx.ports.sessionUseCases.saveUnlockedVaultSession.execute,
    ).toHaveBeenCalledWith({
      session: {
        unlockedVault: ctx.unlockedVault,
        sourceSnapshotRevision: 7,
      },
    });
    expect(
      ctx.ports.sessionUseCases.removeUnlockedVaultSession.execute,
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
      ctx.ports.sessionUseCases.saveUnlockedVaultSession.execute,
    ).mockRejectedValueOnce(error);

    await expect(
      ctx.useCase.execute({
        unlockedVault: ctx.unlockedVault,
        sourceSnapshotRevision: 7,
      }),
    ).rejects.toBe(error);

    expect(
      ctx.ports.sessionUseCases.removeUnlockedVaultSession.execute,
    ).toHaveBeenCalled();
  });

  it("does not clear the active session after a cross-vault save violation", async () => {
    const ctx = createContext();
    const error = new ActiveUnlockedVaultMismatchError(
      ctx.values.vaultId,
      "other-vault",
    );

    vi.mocked(
      ctx.ports.sessionUseCases.saveUnlockedVaultSession.execute,
    ).mockRejectedValueOnce(error);

    await expect(
      ctx.useCase.execute({
        unlockedVault: ctx.unlockedVault,
        sourceSnapshotRevision: 7,
      }),
    ).rejects.toBe(error);

    expect(
      ctx.ports.sessionUseCases.removeUnlockedVaultSession.execute,
    ).not.toHaveBeenCalled();
  });

  it("clears the active session after an invalid-session save error", async () => {
    const ctx = createContext();
    const error = new UnlockedVaultSessionInvalidError("payload mismatch");

    vi.mocked(
      ctx.ports.sessionUseCases.saveUnlockedVaultSession.execute,
    ).mockRejectedValueOnce(error);

    await expect(
      ctx.useCase.execute({
        unlockedVault: ctx.unlockedVault,
        sourceSnapshotRevision: 7,
      }),
    ).rejects.toBe(error);

    expect(
      ctx.ports.sessionUseCases.removeUnlockedVaultSession.execute,
    ).toHaveBeenCalled();
  });

  it("preserves the session commit error when cleanup also fails", async () => {
    const ctx = createContext();
    const error = new Error("session save failed");

    vi.mocked(
      ctx.ports.sessionUseCases.saveUnlockedVaultSession.execute,
    ).mockRejectedValueOnce(error);
    vi.mocked(
      ctx.ports.sessionUseCases.removeUnlockedVaultSession.execute,
    ).mockRejectedValueOnce(new Error("cleanup failed"));

    await expect(
      ctx.useCase.execute({
        unlockedVault: ctx.unlockedVault,
        sourceSnapshotRevision: 7,
      }),
    ).rejects.toBe(error);
  });
});
