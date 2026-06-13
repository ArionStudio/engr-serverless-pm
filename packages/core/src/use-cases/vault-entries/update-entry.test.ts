import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import {
  createVaultSnapshotServiceMock,
  firstPasswordEntry,
  saveUnlockedVaultWithEntries,
  secondPasswordEntry,
  standardPasswordEntries,
} from "../../__tests__/fixtures/vault-entries";
import {
  InvalidPasswordEntryError,
  PasswordEntryNotFoundError,
} from "../../errors/vault-entry.errors";
import { VaultMustBeUnlockedError } from "../../errors/vault-session.errors";
import { UpdateEntryUseCase } from "./update-entry";

function createContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  const vaultSnapshot = createVaultSnapshotServiceMock(values);
  saveUnlockedVaultWithEntries(ports, values, standardPasswordEntries);

  return {
    values,
    ports,
    saved: ports.saved,
    vaultSnapshot,
    useCase: new UpdateEntryUseCase(
      ports.sessionServices.unlockedVaultSession,
      vaultSnapshot,
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
          versionVector: {
            [ctx.values.deviceId]: 2,
          },
        },
        secondPasswordEntry,
      ],
    );
    expect(
      ctx.saved.unlockedVaultSession?.unlockedVault.vault.versionVector,
    ).toEqual({
      [ctx.values.deviceId]: 2,
    });
    expect(ctx.saved.unlockedVaultSession?.sourceSnapshotRevision).toBe(2);
    expect(ctx.vaultSnapshot.persistUnlockedVault).toHaveBeenCalledWith(
      ctx.values.vaultId,
      expect.objectContaining({
        vault: expect.objectContaining({
          entries: ctx.saved.unlockedVaultSession?.unlockedVault.vault.entries,
        }),
      }),
      1,
    );
    expect(
      vi.mocked(ctx.vaultSnapshot.persistUnlockedVault).mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(ctx.ports.sessionServices.unlockedVaultSession.commit).mock
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
      ctx.ports.sessionServices.unlockedVaultSession.commit,
    ).not.toHaveBeenCalled();
    expect(ctx.vaultSnapshot.persistUnlockedVault).not.toHaveBeenCalled();
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
      ctx.ports.sessionServices.unlockedVaultSession.commit,
    ).not.toHaveBeenCalled();
    expect(ctx.vaultSnapshot.persistUnlockedVault).not.toHaveBeenCalled();
  });

  it("does not save the session vault when snapshot persistence fails", async () => {
    const ctx = createContext();
    vi.mocked(ctx.vaultSnapshot.persistUnlockedVault).mockRejectedValueOnce(
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
      ctx.ports.sessionServices.unlockedVaultSession.commit,
    ).not.toHaveBeenCalled();
    expect(ctx.saved.unlockedVaultSession?.unlockedVault.vault.entries).toEqual(
      [firstPasswordEntry, secondPasswordEntry],
    );
  });

  it("bubbles the session commit failure after snapshot persistence", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.sessionServices.unlockedVaultSession.commit,
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

    expect(ctx.vaultSnapshot.persistUnlockedVault).toHaveBeenCalled();
  });

  it("preserves the session commit error", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.sessionServices.unlockedVaultSession.commit,
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
  });
});
