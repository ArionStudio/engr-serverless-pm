import { VaultMutationService } from "../../services/vault/vault-mutation.service";
import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import {
  createVaultSnapshotServiceMock,
  saveUnlockedVaultWithEntries,
} from "../../__tests__/fixtures/vault-entries";
import { VaultSyncGuardService } from "../../services/sync";
import { toVaultSnapshotDescriptor } from "../../domain/snapshot";
import { AddFolderUseCase } from "./add-folder";
import { ReadFoldersUseCase } from "./read-folders";

import { UpdateFolderUseCase } from "./update-folder";
import { MoveFolderUseCase } from "./move-folder";
import { RemoveFolderUseCase } from "./remove-folder";
import {
  VaultFolderChangedError,
  VaultFolderCycleError,
  VaultFolderNotEmptyError,
} from "../../errors/vault-organization.errors";
import { VaultMustBeUnlockedError } from "../../errors/vault-session.errors";
import { SyncProviderUploadRejectedError } from "../../errors/sync.errors";

function context() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  const snapshot = createVaultSnapshotServiceMock(values, ports);
  const session = ports.sessionServices.unlockedVaultSession;
  const guard = new VaultSyncGuardService(
    ports.syncProvider,
    snapshot,
    session,
    ports.crypto,
    ports.vaultLocalRepository,
  );
  const mutation = new VaultMutationService(session, guard, snapshot);
  saveUnlockedVaultWithEntries(ports, values, []);
  const current = ports.saved.unlockedVaultSession!;
  ports.saved.unlockedVaultSession = {
    ...current,
    unlockedVault: {
      ...current.unlockedVault,
      vault: {
        ...current.unlockedVault.vault,
        folders: [
          {
            id: "parent",
            name: "Parent",
            icon: "folder",
            parentId: null,
            createdAt: values.timestamp,
            versionVector: { [values.deviceId]: 1 },
          },
          {
            id: "child",
            name: "Child",
            icon: "folder",
            parentId: "parent",
            createdAt: values.timestamp,
            versionVector: { [values.deviceId]: 1 },
          },
        ],
      },
    },
  };
  return {
    values,
    ports,
    snapshot,
    add: new AddFolderUseCase(ports.ids, ports.clock, mutation),
    update: new UpdateFolderUseCase(mutation),
    move: new MoveFolderUseCase(mutation),
    remove: new RemoveFolderUseCase(ports.clock, mutation),
    command: {
      vaultId: values.vaultId,
      folderId: "child",
      expectedFolderVersionVector: { [values.deviceId]: 1 },
    },
  };
}

describe("vault folder use cases", () => {
  it.each([
    { name: "New", parentId: "missing", error: "VaultFolderNotFoundError" },
    {
      name: "ＰＡＲＥＮＴ",
      parentId: null,
      error: "DuplicateVaultFolderNameError",
    },
  ])(
    "rejects invalid folder placement before generating IDs: $error",
    async ({ name, parentId, error }) => {
      const ctx = context();
      vi.mocked(ctx.ports.ids.generateId).mockClear();
      await expect(
        ctx.add.execute({
          vaultId: ctx.values.vaultId,
          folder: { name, parentId, icon: "folder" },
        }),
      ).rejects.toMatchObject({ name: error });
      expect(ctx.ports.ids.generateId).not.toHaveBeenCalled();
      expect(ctx.snapshot.persistUnlockedVault).not.toHaveBeenCalled();
    },
  );

  it.each(["add", "update", "move"] as const)(
    "rejects malformed folder %s input before restoring secrets or generating IDs",
    async (action) => {
      const ctx = context();
      const read = vi.spyOn(
        ctx.ports.sessionServices.unlockedVaultSession,
        "requireUnlockedVaultContext",
      );
      vi.mocked(ctx.ports.ids.generateId).mockClear();
      const folder = { name: "", icon: "folder", parentId: null };
      await expect(
        action === "add"
          ? ctx.add.execute({ vaultId: ctx.values.vaultId, folder })
          : action === "update"
            ? ctx.update.execute({ ...ctx.command, folder })
            : ctx.move.execute({ ...ctx.command, parentId: " padded " }),
      ).rejects.toMatchObject({ name: "InvalidVaultFolderError" });
      expect(read).not.toHaveBeenCalled();
      expect(ctx.ports.ids.generateId).not.toHaveBeenCalled();
      expect(ctx.snapshot.persistUnlockedVault).not.toHaveBeenCalled();
    },
  );

  it("persists a new folder and exposes organization counts without mutable vectors", async () => {
    const values = createCoreTestValues();
    const ports = createCoreTestPorts(values);
    const snapshot = createVaultSnapshotServiceMock(values, ports);
    const syncGuard = new VaultSyncGuardService(
      ports.syncProvider,
      snapshot,
      ports.sessionServices.unlockedVaultSession,
      ports.crypto,
      ports.vaultLocalRepository,
    );
    saveUnlockedVaultWithEntries(ports, values, []);
    vi.mocked(ports.ids.generateId).mockReset().mockResolvedValue("work");
    const add = new AddFolderUseCase(
      ports.ids,
      ports.clock,
      new VaultMutationService(
        ports.sessionServices.unlockedVaultSession,
        syncGuard,
        snapshot,
      ),
    );
    const read = new ReadFoldersUseCase(
      ports.sessionServices.unlockedVaultSession,
    );

    const added = await add.execute({
      vaultId: values.vaultId,
      folder: {
        name: "Work",
        icon: "briefcase",
        parentId: null,
      },
    });
    const result = await read.execute({ vaultId: values.vaultId });

    expect(added).toEqual({
      folderId: "work",
      snapshotVersionVector: { [values.deviceId]: 2 },
      revisionTimestamp: values.timestamp + 1,
      syncUpload: "complete",
      syncConfigured: false,
    });
    expect(result.folders).toEqual([
      expect.objectContaining({
        id: "work",
        name: "Work",
        entryCount: 0,
        childCount: 0,
      }),
    ]);
    expect(result.folders[0]?.versionVector).not.toBe(
      ports.saved.unlockedVaultSession?.unlockedVault.vault.folders[0]
        ?.versionVector,
    );
  });

  it("reports configured sync from the shared prepared folder mutation", async () => {
    const values = createCoreTestValues();
    const ports = createCoreTestPorts(values);
    const snapshot = createVaultSnapshotServiceMock(values, ports);
    const syncGuard = new VaultSyncGuardService(
      ports.syncProvider,
      snapshot,
      ports.sessionServices.unlockedVaultSession,
      ports.crypto,
      ports.vaultLocalRepository,
    );
    saveUnlockedVaultWithEntries(ports, values, []);
    const session = ports.saved.unlockedVaultSession!;
    ports.saved.unlockedVaultSession = {
      ...session,
      unlockedVault: {
        ...session.unlockedVault,
        vault: {
          ...session.unlockedVault.vault,
          syncTarget: values.syncTarget,
        },
      },
    };
    vi.mocked(
      ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce(
      toVaultSnapshotDescriptor(values.vaultId, ports.saved.vaultSnapshot!),
    );
    vi.mocked(ports.ids.generateId).mockReset().mockResolvedValue("synced");
    const add = new AddFolderUseCase(
      ports.ids,
      ports.clock,
      new VaultMutationService(
        ports.sessionServices.unlockedVaultSession,
        syncGuard,
        snapshot,
      ),
    );

    const result = await add.execute({
      vaultId: values.vaultId,
      folder: { name: "Synced", icon: "cloud", parentId: null },
    });

    expect(result.syncConfigured).toBe(true);
  });
});

describe("persisted folder changes", () => {
  it("renames, moves and removes a folder with causal versions and a tombstone", async () => {
    const ctx = context();
    await ctx.update.execute({
      ...ctx.command,
      folder: { name: "Renamed", icon: "folder" },
    });
    let folder =
      ctx.ports.saved.unlockedVaultSession!.unlockedVault.vault.folders[1];
    expect(folder.name).toBe("Renamed");
    await ctx.move.execute({
      ...ctx.command,
      expectedFolderVersionVector: folder.versionVector,
      parentId: null,
    });
    folder =
      ctx.ports.saved.unlockedVaultSession!.unlockedVault.vault.folders[1];
    expect(folder.parentId).toBeNull();
    await ctx.remove.execute({
      ...ctx.command,
      expectedFolderVersionVector: folder.versionVector,
    });
    const vault = ctx.ports.saved.unlockedVaultSession!.unlockedVault.vault;
    expect(vault.folders.map((item) => item.id)).toEqual(["parent"]);
    expect(vault.deletedFolders).toEqual([
      {
        id: "child",
        deletedAt: ctx.values.timestamp,
        versionVector: { [ctx.values.deviceId]: 4 },
      },
    ]);
  });

  it.each(["update", "move", "remove"] as const)(
    "rejects locked and stale %s commands before writing",
    async (operation) => {
      const ctx = context();
      const execute = () =>
        operation === "update"
          ? ctx.update.execute({
              ...ctx.command,
              folder: { name: "Renamed", icon: "folder" },
            })
          : operation === "move"
            ? ctx.move.execute({ ...ctx.command, parentId: null })
            : ctx.remove.execute(ctx.command);
      const session = ctx.ports.saved.unlockedVaultSession;
      ctx.ports.saved.unlockedVaultSession = undefined;
      await expect(execute()).rejects.toBeInstanceOf(VaultMustBeUnlockedError);
      ctx.ports.saved.unlockedVaultSession = session;
      ctx.command.expectedFolderVersionVector = { [ctx.values.deviceId]: 0 };
      await expect(execute()).rejects.toBeInstanceOf(VaultFolderChangedError);
      expect(ctx.snapshot.persistUnlockedVault).not.toHaveBeenCalled();
    },
  );

  it("refuses a cycle or removal of a parent without changing its saved state", async () => {
    const ctx = context();
    const previous = ctx.ports.saved.unlockedVaultSession;
    await expect(
      ctx.move.execute({
        ...ctx.command,
        folderId: "parent",
        parentId: "child",
      }),
    ).rejects.toBeInstanceOf(VaultFolderCycleError);
    await expect(
      ctx.remove.execute({ ...ctx.command, folderId: "parent" }),
    ).rejects.toBeInstanceOf(VaultFolderNotEmptyError);
    expect(ctx.ports.saved.unlockedVaultSession).toBe(previous);
    expect(ctx.snapshot.persistUnlockedVault).not.toHaveBeenCalled();
  });

  it("preserves the old folder when snapshot persistence fails", async () => {
    const ctx = context();
    const previous = ctx.ports.saved.unlockedVaultSession;
    vi.mocked(ctx.snapshot.persistUnlockedVault).mockRejectedValueOnce(
      new Error("Write failed"),
    );
    await expect(ctx.remove.execute(ctx.command)).rejects.toThrow(
      "Write failed",
    );
    expect(ctx.ports.saved.unlockedVaultSession).toBe(previous);
  });

  it("invalidates the session if encryption fails after the folder snapshot is saved", async () => {
    const ctx = context();
    const previous = ctx.ports.saved.vaultSnapshot;
    vi.mocked(
      ctx.ports.crypto.encryptUnlockedVaultSessionPayload,
    ).mockRejectedValueOnce(new Error("Session write failed"));
    await expect(ctx.remove.execute(ctx.command)).rejects.toThrow(
      "Session write failed",
    );
    expect(ctx.ports.saved.vaultSnapshot).not.toBe(previous);
    expect(ctx.ports.saved.unlockedVaultSession).toBeUndefined();
  });

  it("restores the snapshot and folder when S3 definitely rejects the mutation", async () => {
    const ctx = context();
    const session = ctx.ports.saved.unlockedVaultSession!;
    ctx.ports.saved.unlockedVaultSession = {
      ...session,
      unlockedVault: {
        ...session.unlockedVault,
        vault: {
          ...session.unlockedVault.vault,
          syncTarget: ctx.values.syncTarget,
        },
      },
    };
    const previous = ctx.ports.saved.vaultSnapshot!;
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce(
      toVaultSnapshotDescriptor(ctx.values.vaultId, previous),
    );
    vi.mocked(ctx.ports.syncProvider.uploadVaultSnapshot).mockResolvedValueOnce(
      { status: "definitely_not_committed", reason: "provider_rejected" },
    );
    await expect(ctx.remove.execute(ctx.command)).rejects.toBeInstanceOf(
      SyncProviderUploadRejectedError,
    );
    expect(ctx.ports.saved.vaultSnapshot).toEqual(previous);
    expect(
      ctx.ports.saved.unlockedVaultSession?.unlockedVault.vault.folders,
    ).toEqual(session.unlockedVault.vault.folders);
  });
});
