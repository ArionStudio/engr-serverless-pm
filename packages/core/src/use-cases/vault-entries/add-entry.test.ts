import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import {
  createVaultSnapshotServiceMock,
  saveUnlockedVaultWithEntries,
} from "../../__tests__/fixtures/vault-entries";
import {
  RemoteVaultSnapshotAheadError,
  RemoteVaultSnapshotChangedError,
  SyncConflictDetectedError,
} from "../../errors/sync.errors";
import { InvalidPasswordEntryError } from "../../errors/vault-entry.errors";
import { VaultMustBeUnlockedError } from "../../errors/vault-session.errors";
import { VaultSyncGuardService } from "../../services/sync";
import { AddEntryUseCase } from "./add-entry";

function createContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  const vaultSnapshot = createVaultSnapshotServiceMock(values);
  const vaultSyncGuard = new VaultSyncGuardService(
    ports.syncProvider,
    vaultSnapshot,
  );
  vi.mocked(ports.ids.generateId).mockReset().mockResolvedValue("entry-id");

  saveUnlockedVaultWithEntries(ports, values, []);

  const useCase = new AddEntryUseCase(
    ports.ids,
    ports.sessionServices.unlockedVaultSession,
    vaultSyncGuard,
    vaultSnapshot,
  );

  return {
    values,
    ports,
    saved: ports.saved,
    vaultSyncGuard,
    vaultSnapshot,
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
      snapshotVersionVector: {
        [ctx.values.deviceId]: 2,
      },
      revisionTimestamp: ctx.values.timestamp + 1,
    });
    expect(ctx.saved.unlockedVaultSession?.unlockedVault.vault.entries).toEqual(
      [
        {
          id: "entry-id",
          password: "secret-password",
          login: "user@example.com",
          tags: [1, 2],
          sanitizedUrl: "https://example.com/login",
          versionVector: {
            [ctx.values.deviceId]: 2,
          },
        },
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
      vi.mocked(ctx.ports.sessionServices.unlockedVaultSession.commit).mock
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
      ctx.ports.sessionServices.unlockedVaultSession.commit,
    ).not.toHaveBeenCalled();
    expect(ctx.vaultSnapshot.persistUnlockedVault).not.toHaveBeenCalled();
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
      ctx.ports.sessionServices.unlockedVaultSession.commit,
    ).not.toHaveBeenCalled();
    expect(ctx.vaultSnapshot.persistUnlockedVault).not.toHaveBeenCalled();
  });

  it("does not add an entry when synced remote changes must be downloaded first", async () => {
    const ctx = createContext();
    const session = ctx.saved.unlockedVaultSession!;

    ctx.saved.unlockedVaultSession = {
      ...session,
      unlockedVault: {
        ...session.unlockedVault,
        vault: {
          ...session.unlockedVault.vault,
          syncConfig: ctx.values.syncConfig,
        },
      },
    };
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce({
      vaultId: ctx.values.vaultId,
      snapshotVersionVector: {
        [ctx.values.deviceId]: 1,
        "remote-device-id": 1,
      },
      revisionTimestamp: ctx.values.timestamp + 1,
    });

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
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotAheadError);

    expect(ctx.ports.ids.generateId).not.toHaveBeenCalled();
    expect(ctx.vaultSnapshot.persistUnlockedVault).not.toHaveBeenCalled();
    expect(
      ctx.ports.sessionServices.unlockedVaultSession.commit,
    ).not.toHaveBeenCalled();
    expect(ctx.saved.unlockedVaultSession?.unlockedVault.vault.entries).toEqual(
      [],
    );
  });

  it("uploads the persisted snapshot before committing a synced vault entry", async () => {
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
          syncConfig: ctx.values.syncConfig,
        },
      },
    };
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce(remoteSnapshotDescriptor);

    await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      entry: {
        password: "secret-password",
        login: "user@example.com",
        tags: [],
        url: "https://example.com/login",
      },
    });

    expect(ctx.ports.syncProvider.uploadVaultSnapshot).toHaveBeenCalledWith(
      ctx.values.syncConfig,
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
      vi.mocked(ctx.vaultSnapshot.persistUnlockedVault).mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(ctx.ports.syncProvider.uploadVaultSnapshot).mock
        .invocationCallOrder[0],
    );
    expect(
      vi.mocked(ctx.ports.syncProvider.uploadVaultSnapshot).mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(ctx.ports.sessionServices.unlockedVaultSession.commit).mock
        .invocationCallOrder[0],
    );
  });

  it("restores the local snapshot and does not commit when synced upload races", async () => {
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
          syncConfig: ctx.values.syncConfig,
        },
      },
    };
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce(remoteSnapshotDescriptor);
    vi.mocked(ctx.ports.syncProvider.uploadVaultSnapshot).mockRejectedValueOnce(
      new RemoteVaultSnapshotChangedError(ctx.values.vaultId),
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
    ).rejects.toBeInstanceOf(SyncConflictDetectedError);

    expect(ctx.vaultSnapshot.restoreLocalVaultSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          snapshotVersionVector: {
            [ctx.values.deviceId]: 1,
          },
        }),
      }),
    );
    expect(
      ctx.ports.sessionServices.unlockedVaultSession.commit,
    ).not.toHaveBeenCalled();
  });

  it("does not save the session vault when snapshot persistence fails", async () => {
    const ctx = createContext();
    vi.mocked(ctx.vaultSnapshot.persistUnlockedVault).mockRejectedValueOnce(
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
      ctx.ports.sessionServices.unlockedVaultSession.commit,
    ).not.toHaveBeenCalled();
    expect(ctx.saved.unlockedVaultSession?.unlockedVault.vault.entries).toEqual(
      [],
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
        entry: {
          password: "secret-password",
          login: "user@example.com",
          tags: [],
          url: "https://example.com/login",
        },
      }),
    ).rejects.toThrow("session save failed");

    expect(ctx.vaultSnapshot.persistUnlockedVault).toHaveBeenCalled();
    expect(
      ctx.ports.sessionServices.unlockedVaultSession.remove,
    ).toHaveBeenCalled();
    expect(ctx.saved.unlockedVaultSession).toBeUndefined();
  });

  it("preserves the session commit error", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.sessionServices.unlockedVaultSession.commit,
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
  });
});
