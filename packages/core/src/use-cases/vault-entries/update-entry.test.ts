import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import {
  createPersistUnlockedVaultUseCaseMock,
  firstPasswordEntry,
  saveUnlockedVaultWithEntries,
  secondPasswordEntry,
  standardPasswordEntries,
} from "../../__tests__/fixtures/vault-entries";
import {
  InvalidPasswordEntryError,
  PasswordEntryNotFoundError,
} from "../__errors/vault-entry.errors";
import { VaultMustBeUnlockedError } from "../__errors/vault-session.errors";
import { CommitUnlockedVaultSessionUseCase } from "../vault-session/commit-unlocked-vault-session";
import { UpdateEntryUseCase } from "./update-entry";

function createContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  const persistUnlockedVault = createPersistUnlockedVaultUseCaseMock(values);
  const commitUnlockedVaultSession = new CommitUnlockedVaultSessionUseCase(
    ports.unlockedVaultRepository,
  );

  saveUnlockedVaultWithEntries(ports, values, standardPasswordEntries);

  return {
    values,
    ports,
    saved: ports.saved,
    persistUnlockedVault,
    useCase: new UpdateEntryUseCase(
      ports.unlockedVaultRepository,
      persistUnlockedVault,
      commitUnlockedVaultSession,
    ),
  };
}

describe("UpdateEntryUseCase", () => {
  it("updates a validated entry in session vault and persists a new snapshot", async () => {
    const ctx = createContext();

    const result = await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      entryId: firstPasswordEntry.id,
      entry: {
        password: "updated-password",
        login: "updated@example.com",
        tags: [1, 2],
        url: "https://example.com/updated?token=secret#field",
      },
    });

    expect(result).toEqual({
      entryId: firstPasswordEntry.id,
      revision: 2,
      revisionTimestamp: ctx.values.timestamp + 1,
      deviceId: ctx.values.deviceId,
    });
    expect(ctx.saved.unlockedVaultSession?.unlockedVault.vault.entries).toEqual(
      [
        {
          id: firstPasswordEntry.id,
          password: "updated-password",
          login: "updated@example.com",
          tags: [1, 2],
          sanitizedUrl: "https://example.com/updated",
        },
        secondPasswordEntry,
      ],
    );
    expect(ctx.saved.unlockedVaultSession?.sourceSnapshotRevision).toBe(2);
    expect(ctx.persistUnlockedVault.execute).toHaveBeenCalledWith({
      vaultId: ctx.values.vaultId,
      unlockedVault: expect.objectContaining({
        vault: expect.objectContaining({
          entries: ctx.saved.unlockedVaultSession?.unlockedVault.vault.entries,
        }),
      }),
    });
    expect(
      vi.mocked(ctx.persistUnlockedVault.execute).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(ctx.ports.unlockedVaultRepository.saveUnlockedVaultSession).mock
        .invocationCallOrder[0],
    );
  });

  it("does not save or persist snapshot when entry validation fails", async () => {
    const ctx = createContext();

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entryId: firstPasswordEntry.id,
        entry: {
          password: "",
          login: "updated@example.com",
          tags: [],
          url: "https://example.com",
        },
      }),
    ).rejects.toBeInstanceOf(InvalidPasswordEntryError);

    expect(
      ctx.ports.unlockedVaultRepository.saveUnlockedVaultSession,
    ).not.toHaveBeenCalled();
    expect(ctx.persistUnlockedVault.execute).not.toHaveBeenCalled();
  });

  it("fails when the target vault is not unlocked", async () => {
    const ctx = createContext();
    ctx.saved.unlockedVaultSession = undefined;

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entryId: firstPasswordEntry.id,
        entry: {
          password: "updated-password",
          login: "updated@example.com",
          tags: [],
          url: "https://example.com",
        },
      }),
    ).rejects.toBeInstanceOf(VaultMustBeUnlockedError);
  });

  it("fails when requested entry does not exist", async () => {
    const ctx = createContext();

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entryId: "missing-entry",
        entry: {
          password: "updated-password",
          login: "updated@example.com",
          tags: [],
          url: "https://example.com",
        },
      }),
    ).rejects.toBeInstanceOf(PasswordEntryNotFoundError);

    expect(
      ctx.ports.unlockedVaultRepository.saveUnlockedVaultSession,
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
        entryId: firstPasswordEntry.id,
        entry: {
          password: "updated-password",
          login: "updated@example.com",
          tags: [],
          url: "https://example.com",
        },
      }),
    ).rejects.toThrow("persist failed");

    expect(
      ctx.ports.unlockedVaultRepository.saveUnlockedVaultSession,
    ).not.toHaveBeenCalled();
    expect(ctx.saved.unlockedVaultSession?.unlockedVault.vault.entries).toEqual(
      [firstPasswordEntry, secondPasswordEntry],
    );
  });

  it("clears the session vault when session save fails after snapshot persistence", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.unlockedVaultRepository.saveUnlockedVaultSession,
    ).mockRejectedValueOnce(new Error("session save failed"));

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entryId: firstPasswordEntry.id,
        entry: {
          password: "updated-password",
          login: "updated@example.com",
          tags: [],
          url: "https://example.com",
        },
      }),
    ).rejects.toThrow("session save failed");

    expect(ctx.persistUnlockedVault.execute).toHaveBeenCalled();
    expect(
      ctx.ports.unlockedVaultRepository.removeUnlockedVaultSession,
    ).toHaveBeenCalled();
    expect(ctx.saved.unlockedVaultSession).toBeUndefined();
  });

  it("preserves the session save error when cleanup also fails", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.unlockedVaultRepository.saveUnlockedVaultSession,
    ).mockRejectedValueOnce(new Error("session save failed"));
    vi.mocked(
      ctx.ports.unlockedVaultRepository.removeUnlockedVaultSession,
    ).mockRejectedValueOnce(new Error("cleanup failed"));

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entryId: firstPasswordEntry.id,
        entry: {
          password: "updated-password",
          login: "updated@example.com",
          tags: [],
          url: "https://example.com",
        },
      }),
    ).rejects.toThrow("session save failed");
  });
});
