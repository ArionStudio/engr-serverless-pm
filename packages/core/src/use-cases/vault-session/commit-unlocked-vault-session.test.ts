import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import { createUnlockedVaultWithEntries } from "../../__tests__/fixtures/vault-entries";
import {
  ActiveUnlockedVaultMismatchError,
  UnlockedVaultSessionInvalidError,
} from "../../ports/vault/unlocked-vault-repository.errors";
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
      ports.unlockedVaultRepository,
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
      ctx.ports.unlockedVaultRepository.saveUnlockedVaultSession,
    ).toHaveBeenCalledWith({
      unlockedVault: ctx.unlockedVault,
      sourceSnapshotRevision: 7,
    });
    expect(
      ctx.ports.unlockedVaultRepository.removeUnlockedVaultSession,
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
      ctx.ports.unlockedVaultRepository.saveUnlockedVaultSession,
    ).mockRejectedValueOnce(error);

    await expect(
      ctx.useCase.execute({
        unlockedVault: ctx.unlockedVault,
        sourceSnapshotRevision: 7,
      }),
    ).rejects.toBe(error);

    expect(
      ctx.ports.unlockedVaultRepository.removeUnlockedVaultSession,
    ).toHaveBeenCalled();
  });

  it("does not clear the active session after a cross-vault save violation", async () => {
    const ctx = createContext();
    const error = new ActiveUnlockedVaultMismatchError(
      ctx.values.vaultId,
      "other-vault",
    );

    vi.mocked(
      ctx.ports.unlockedVaultRepository.saveUnlockedVaultSession,
    ).mockRejectedValueOnce(error);

    await expect(
      ctx.useCase.execute({
        unlockedVault: ctx.unlockedVault,
        sourceSnapshotRevision: 7,
      }),
    ).rejects.toBe(error);

    expect(
      ctx.ports.unlockedVaultRepository.removeUnlockedVaultSession,
    ).not.toHaveBeenCalled();
  });

  it("does not clear the active session after an invalid-session repository error", async () => {
    const ctx = createContext();
    const error = new UnlockedVaultSessionInvalidError("payload mismatch");

    vi.mocked(
      ctx.ports.unlockedVaultRepository.saveUnlockedVaultSession,
    ).mockRejectedValueOnce(error);

    await expect(
      ctx.useCase.execute({
        unlockedVault: ctx.unlockedVault,
        sourceSnapshotRevision: 7,
      }),
    ).rejects.toBe(error);

    expect(
      ctx.ports.unlockedVaultRepository.removeUnlockedVaultSession,
    ).not.toHaveBeenCalled();
  });

  it("preserves the session commit error when cleanup also fails", async () => {
    const ctx = createContext();
    const error = new Error("session save failed");

    vi.mocked(
      ctx.ports.unlockedVaultRepository.saveUnlockedVaultSession,
    ).mockRejectedValueOnce(error);
    vi.mocked(
      ctx.ports.unlockedVaultRepository.removeUnlockedVaultSession,
    ).mockRejectedValueOnce(new Error("cleanup failed"));

    await expect(
      ctx.useCase.execute({
        unlockedVault: ctx.unlockedVault,
        sourceSnapshotRevision: 7,
      }),
    ).rejects.toBe(error);
  });
});
