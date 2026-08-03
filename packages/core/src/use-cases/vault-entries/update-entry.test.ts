import { describe, expect, it, vi } from "vitest";
import { objectGraphContainsString } from "../../__tests__/fixtures/error-inspection";
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
  InvalidEntryUrlError,
  InvalidPasswordEntryError,
  PasswordEntryStrengthRequirementNotMetError,
  PasswordEntryNotFoundError,
} from "../../errors/vault-entry.errors";
import { VaultMustBeUnlockedError } from "../../errors/vault-session.errors";
import { VaultSyncGuardService } from "../../services/sync";
import { UpdateEntryUseCase } from "./update-entry";

const maximumStrengthPassword = "mQ8#sW3!cH7@uJ5$eR9%";

function createContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  const vaultSnapshot = createVaultSnapshotServiceMock(values);
  const vaultSyncGuard = new VaultSyncGuardService(
    ports.syncProvider,
    vaultSnapshot,
    ports.sessionServices.unlockedVaultSession,
    ports.crypto,
    ports.vaultLocalRepository,
  );
  saveUnlockedVaultWithEntries(ports, values, standardPasswordEntries);

  return {
    values,
    ports,
    saved: ports.saved,
    vaultSyncGuard,
    vaultSnapshot,
    useCase: new UpdateEntryUseCase(
      ports.sessionServices.unlockedVaultSession,
      vaultSyncGuard,
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
        password: maximumStrengthPassword,
        login: "updated@example.com",
        tags: [1, 2],
        url: "https://example.com/updated?token=secret#field",
      },
    });

    expect(result).toEqual({
      entryId: firstPasswordEntry.id,
      snapshotVersionVector: {
        [ctx.values.deviceId]: 2,
      },
      revisionTimestamp: ctx.values.timestamp + 1,
    });
    expect(ctx.saved.unlockedVaultSession?.unlockedVault.vault.entries).toEqual(
      [
        {
          id: firstPasswordEntry.id,
          password: maximumStrengthPassword,
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
    expect(ctx.saved.unlockedVaultSession?.sourceSnapshotVersionVector).toEqual(
      {
        [ctx.values.deviceId]: 2,
      },
    );
    expect(ctx.vaultSnapshot.persistUnlockedVault).toHaveBeenCalledWith(
      ctx.values.vaultId,
      expect.objectContaining({
        vault: expect.objectContaining({
          entries: ctx.saved.unlockedVaultSession?.unlockedVault.vault.entries,
        }),
      }),
      {
        [ctx.values.deviceId]: 1,
      },
    );
    expect(
      vi.mocked(ctx.vaultSnapshot.persistUnlockedVault).mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(
        ctx.ports.sessionServices.unlockedVaultSession.commitPersistedSnapshot,
      ).mock.invocationCallOrder[0],
    );
  });

  it("rejects a password below maximum strength by default without side effects or secret retention", async () => {
    const ctx = createContext();
    const submittedPassword = "correcthorsebatterystaple";
    const prepareLocalMutation = vi.spyOn(
      ctx.vaultSyncGuard,
      "prepareLocalMutation",
    );
    let caught: unknown;

    try {
      await ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entryId: firstPasswordEntry.id,
        entry: {
          password: submittedPassword,
          login: "updated@example.com",
          tags: [],
          url: "https://example.com",
        },
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(PasswordEntryStrengthRequirementNotMetError);
    expect(caught).not.toHaveProperty("cause");
    expect(objectGraphContainsString(caught, submittedPassword)).toBe(false);
    expect(prepareLocalMutation).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
    expect(ctx.vaultSnapshot.persistUnlockedVault).not.toHaveBeenCalled();
    expect(
      ctx.ports.sessionServices.unlockedVaultSession.commitPersistedSnapshot,
    ).not.toHaveBeenCalled();
  });

  it("updates an entry to a weak password only when the caller explicitly allows it", async () => {
    const ctx = createContext();
    const weakPassword = "correcthorsebatterystaple";

    await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      entryId: firstPasswordEntry.id,
      allowWeakPassword: true,
      entry: {
        password: weakPassword,
        login: "updated@example.com",
        tags: [],
        url: "https://example.com",
      },
    });

    expect(
      ctx.saved.unlockedVaultSession?.unlockedVault.vault.entries[0]?.password,
    ).toBe(weakPassword);
  });

  it("uploads the persisted snapshot before committing a synced entry update", async () => {
    const ctx = createContext();
    const remoteSnapshotDescriptor = {
      vaultId: ctx.values.vaultId,
      snapshotVersionVector: {
        [ctx.values.deviceId]: 1,
      },
      revisionTimestamp: ctx.values.timestamp,
    };
    const session = ctx.saved.unlockedVaultSession!;

    ctx.saved.unlockedVaultSession = {
      ...session,
      unlockedVault: {
        ...session.unlockedVault,
        vault: {
          ...session.unlockedVault.vault,
          syncTarget: ctx.values.syncTarget,
        },
      },
    };
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce(remoteSnapshotDescriptor);

    await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      entryId: firstPasswordEntry.id,
      entry: {
        password: maximumStrengthPassword,
        login: "updated@example.com",
        tags: [],
        url: "https://example.com",
      },
    });

    expect(ctx.ports.syncProvider.uploadVaultSnapshot).toHaveBeenCalledWith(
      ctx.values.syncAccess,
      expect.objectContaining({
        metadata: expect.objectContaining({
          snapshotVersionVector: {
            [ctx.values.deviceId]: 2,
          },
        }),
      }),
      remoteSnapshotDescriptor,
    );
    expect(
      vi.mocked(ctx.ports.syncProvider.uploadVaultSnapshot).mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(
        ctx.ports.sessionServices.unlockedVaultSession.commitPersistedSnapshot,
      ).mock.invocationCallOrder[0],
    );
  });

  it("does not save or persist snapshot when entry validation fails", async () => {
    const ctx = createContext();

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entryId: firstPasswordEntry.id,
        allowWeakPassword: true,
        entry: {
          password: "",
          login: "updated@example.com",
          tags: [],
          url: "https://example.com",
        },
      }),
    ).rejects.toBeInstanceOf(InvalidPasswordEntryError);

    expect(
      ctx.ports.sessionServices.unlockedVaultSession.commitPersistedSnapshot,
    ).not.toHaveBeenCalled();
    expect(ctx.vaultSnapshot.persistUnlockedVault).not.toHaveBeenCalled();
  });

  it("does not retain a malformed entry url in the public validation error", async () => {
    const ctx = createContext();
    const credentialSecret = "credential-secret";
    const querySecret = "query-secret";
    let caught: unknown;

    try {
      await ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entryId: firstPasswordEntry.id,
        allowWeakPassword: true,
        entry: {
          password: maximumStrengthPassword,
          login: "updated@example.com",
          tags: [],
          url: `https://user:${credentialSecret}@?token=${querySecret}`,
        },
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(InvalidPasswordEntryError);

    if (!(caught instanceof InvalidPasswordEntryError)) {
      return;
    }

    expect(caught.cause).toBeInstanceOf(InvalidEntryUrlError);
    expect(objectGraphContainsString(caught, credentialSecret)).toBe(false);
    expect(objectGraphContainsString(caught, querySecret)).toBe(false);
    expect(
      ctx.ports.sessionServices.unlockedVaultSession.commitPersistedSnapshot,
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
          password: "correcthorsebatterystaple",
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
          password: "correcthorsebatterystaple",
          login: "updated@example.com",
          tags: [],
          url: "https://example.com",
        },
      }),
    ).rejects.toBeInstanceOf(PasswordEntryNotFoundError);

    expect(
      ctx.ports.sessionServices.unlockedVaultSession.commitPersistedSnapshot,
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
          password: maximumStrengthPassword,
          login: "updated@example.com",
          tags: [],
          url: "https://example.com",
        },
      }),
    ).rejects.toThrow("persist failed");

    expect(
      ctx.ports.sessionServices.unlockedVaultSession.commitPersistedSnapshot,
    ).not.toHaveBeenCalled();
    expect(ctx.saved.unlockedVaultSession?.unlockedVault.vault.entries).toEqual(
      [firstPasswordEntry, secondPasswordEntry],
    );
  });

  it("bubbles the session commit failure after snapshot persistence", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.sessionServices.unlockedVaultSession.commitPersistedSnapshot,
    ).mockRejectedValueOnce(new Error("session save failed"));

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entryId: firstPasswordEntry.id,
        entry: {
          password: maximumStrengthPassword,
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
      ctx.ports.sessionServices.unlockedVaultSession.commitPersistedSnapshot,
    ).mockRejectedValueOnce(new Error("session save failed"));

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        entryId: firstPasswordEntry.id,
        entry: {
          password: maximumStrengthPassword,
          login: "updated@example.com",
          tags: [],
          url: "https://example.com",
        },
      }),
    ).rejects.toThrow("session save failed");
  });
});
