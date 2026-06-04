import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import {
  createPersistUnlockedVaultServiceMock,
  saveUnlockedVaultWithEntries,
} from "../../__tests__/fixtures/vault-entries";
import { InvalidPasswordEntryError } from "../__errors/vault-entry.errors";
import { VaultMustBeUnlockedError } from "../__errors/vault-session.errors";
import { CommitUnlockedVaultSessionService } from "../../application/vault-session/commit-unlocked-vault-session.service";
import { AddEntryUseCase } from "./add-entry";

function createContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  const persistUnlockedVault = createPersistUnlockedVaultServiceMock(values);
  const commitUnlockedVaultSession = new CommitUnlockedVaultSessionService(
    ports.sessionServices.saveUnlockedVaultSession,
    ports.sessionServices.removeUnlockedVaultSession,
  );

  vi.mocked(ports.ids.generateId).mockReset().mockResolvedValue("entry-id");

  saveUnlockedVaultWithEntries(ports, values, []);

  const useCase = new AddEntryUseCase(
    ports.ids,
    ports.sessionServices.getUnlockedVaultSession,
    persistUnlockedVault,
    commitUnlockedVaultSession,
  );

  return {
    values,
    ports,
    saved: ports.saved,
    persistUnlockedVault,
    useCase,
  };
}

describe("AddEntryUseCase", () => {
  it("adds a sanitized password entry to the unlocked vault and persists a new snapshot", async () => {
    const ctx = createContext();

    const result = await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      entry: {
        password: "secret-password",
        login: "user@example.com",
        tags: [1, 2],
        url: "https://example.com/login?session=secret#form",
      },
    });

    expect(result).toEqual({
      entryId: "entry-id",
      revision: 2,
      revisionTimestamp: ctx.values.timestamp + 1,
      deviceId: ctx.values.deviceId,
    });
    expect(ctx.saved.unlockedVaultSession?.unlockedVault.vault.entries).toEqual(
      [
        {
          id: "entry-id",
          password: "secret-password",
          login: "user@example.com",
          tags: [1, 2],
          sanitizedUrl: "https://example.com/login",
        },
      ],
    );
    expect(ctx.saved.unlockedVaultSession?.sourceSnapshotRevision).toBe(2);
    expect(ctx.persistUnlockedVault.persist).toHaveBeenCalledWith(
      ctx.values.vaultId,
      expect.objectContaining({
        vault: expect.objectContaining({
          entries: ctx.saved.unlockedVaultSession?.unlockedVault.vault.entries,
        }),
      }),
    );
    expect(
      vi.mocked(ctx.persistUnlockedVault.persist).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(ctx.ports.sessionServices.saveUnlockedVaultSession.save).mock
        .invocationCallOrder[0],
    );
  });

  it("fails when the target vault is not unlocked", async () => {
    const ctx = createContext();
    ctx.saved.unlockedVaultSession = undefined;

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entry: {
          password: "secret-password",
          login: "user@example.com",
          tags: [],
          url: "https://example.com/login",
        },
      }),
    ).rejects.toBeInstanceOf(VaultMustBeUnlockedError);

    expect(ctx.ports.ids.generateId).not.toHaveBeenCalled();
    expect(
      ctx.ports.sessionServices.saveUnlockedVaultSession.save,
    ).not.toHaveBeenCalled();
    expect(ctx.persistUnlockedVault.persist).not.toHaveBeenCalled();
  });

  it("does not persist a snapshot when entry validation fails", async () => {
    const ctx = createContext();

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entry: {
          password: "",
          login: "user@example.com",
          tags: [],
          url: "https://example.com/login",
        },
      }),
    ).rejects.toBeInstanceOf(InvalidPasswordEntryError);

    expect(ctx.ports.ids.generateId).not.toHaveBeenCalled();
    expect(
      ctx.ports.sessionServices.saveUnlockedVaultSession.save,
    ).not.toHaveBeenCalled();
    expect(ctx.persistUnlockedVault.persist).not.toHaveBeenCalled();
  });

  it("does not save the session vault when snapshot persistence fails", async () => {
    const ctx = createContext();
    vi.mocked(ctx.persistUnlockedVault.persist).mockRejectedValueOnce(
      new Error("persist failed"),
    );

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entry: {
          password: "secret-password",
          login: "user@example.com",
          tags: [],
          url: "https://example.com/login",
        },
      }),
    ).rejects.toThrow("persist failed");

    expect(
      ctx.ports.sessionServices.saveUnlockedVaultSession.save,
    ).not.toHaveBeenCalled();
    expect(ctx.saved.unlockedVaultSession?.unlockedVault.vault.entries).toEqual(
      [],
    );
  });

  it("clears the session vault when session save fails after snapshot persistence", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.sessionServices.saveUnlockedVaultSession.save,
    ).mockRejectedValueOnce(new Error("session save failed"));

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entry: {
          password: "secret-password",
          login: "user@example.com",
          tags: [],
          url: "https://example.com/login",
        },
      }),
    ).rejects.toThrow("session save failed");

    expect(ctx.persistUnlockedVault.persist).toHaveBeenCalled();
    expect(
      ctx.ports.sessionServices.removeUnlockedVaultSession.remove,
    ).toHaveBeenCalled();
    expect(ctx.saved.unlockedVaultSession).toBeUndefined();
  });

  it("preserves the session save error when cleanup also fails", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.sessionServices.saveUnlockedVaultSession.save,
    ).mockRejectedValueOnce(new Error("session save failed"));
    vi.mocked(
      ctx.ports.sessionServices.removeUnlockedVaultSession.remove,
    ).mockRejectedValueOnce(new Error("cleanup failed"));

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entry: {
          password: "secret-password",
          login: "user@example.com",
          tags: [],
          url: "https://example.com/login",
        },
      }),
    ).rejects.toThrow("session save failed");
  });
});
