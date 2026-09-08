import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import {
  createVaultSnapshotServiceMock,
  firstPasswordEntry,
  personalTag,
  saveUnlockedVaultWithEntries,
  standardPasswordEntries,
  standardVaultTags,
  workTag,
} from "../../__tests__/fixtures/vault-entries";
import {
  DuplicateVaultTagNameError,
  VaultTagChangedError,
  VaultTagInUseError,
} from "../../errors/vault-tag.errors";
import { VaultMutationService } from "../../services/vault/vault-mutation.service";
import { VaultSyncGuardService } from "../../services/sync";
import { toVaultSnapshotDescriptor } from "../../domain/snapshot";
import { AddTagUseCase } from "./add-tag";
import { ReadTagsUseCase } from "./read-tags";
import { RemoveTagUseCase } from "./remove-tag";
import { UpdateTagUseCase } from "./update-tag";

function createContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  const vaultSnapshot = createVaultSnapshotServiceMock(values, ports);
  const vaultSyncGuard = new VaultSyncGuardService(
    ports.syncProvider,
    vaultSnapshot,
    ports.sessionServices.unlockedVaultSession,
    ports.crypto,
    ports.vaultLocalRepository,
  );
  const mutation = new VaultMutationService(
    ports.sessionServices.unlockedVaultSession,
    vaultSyncGuard,
    vaultSnapshot,
  );
  saveUnlockedVaultWithEntries(
    ports,
    values,
    standardPasswordEntries,
    standardVaultTags,
  );

  return {
    values,
    ports,
    vaultSnapshot,
    vaultSyncGuard,
    add: new AddTagUseCase(ports.ids, ports.clock, mutation),
    read: new ReadTagsUseCase(ports.sessionServices.unlockedVaultSession),
    update: new UpdateTagUseCase(mutation),
    remove: new RemoveTagUseCase(ports.clock, mutation),
  };
}

describe("vault tag use cases", () => {
  it("adds validated tag metadata and persists it with a stable string id", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.ids.generateId)
      .mockReset()
      .mockResolvedValue("new-tag");

    const result = await ctx.add.execute({
      vaultId: ctx.values.vaultId,
      tag: {
        name: "Production",
        groupId: "environment",
        color: "red",
        shade: 600,
      },
    });

    expect(result).toEqual({
      tagId: "new-tag",
      snapshotVersionVector: { [ctx.values.deviceId]: 2 },
      revisionTimestamp: ctx.values.timestamp + 1,
      syncUpload: "complete",
      syncConfigured: false,
      softLimitReached: false,
    });
    expect(
      ctx.ports.saved.unlockedVaultSession?.unlockedVault.vault.tags.at(-1),
    ).toEqual({
      id: "new-tag",
      name: "Production",
      groupId: "environment",
      color: "red",
      shade: 600,
      createdAt: ctx.values.timestamp,
      versionVector: { [ctx.values.deviceId]: 2 },
    });
  });

  it("reports configured sync from the prepared tag mutation", async () => {
    const ctx = createContext();
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
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce(
      toVaultSnapshotDescriptor(
        ctx.values.vaultId,
        ctx.ports.saved.vaultSnapshot!,
      ),
    );
    vi.mocked(ctx.ports.ids.generateId)
      .mockReset()
      .mockResolvedValue("synced-tag");

    const result = await ctx.add.execute({
      vaultId: ctx.values.vaultId,
      tag: {
        name: "Synced",
        groupId: "other",
        color: "green",
        shade: 500,
      },
    });

    expect(result.syncConfigured).toBe(true);
  });

  it("rejects duplicate names before generating an id or preparing sync", async () => {
    const ctx = createContext();
    const prepare = vi.spyOn(ctx.vaultSyncGuard, "prepareLocalMutation");

    await expect(
      ctx.add.execute({
        vaultId: ctx.values.vaultId,
        tag: {
          name: " work ",
          groupId: "other",
          color: "gray",
          shade: 500,
        },
      }),
    ).rejects.toBeInstanceOf(DuplicateVaultTagNameError);

    expect(ctx.ports.ids.generateId).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
    expect(ctx.vaultSnapshot.persistUnlockedVault).not.toHaveBeenCalled();
  });

  it("rejects a stale tag edit before persistence", async () => {
    const ctx = createContext();

    await expect(
      ctx.update.execute({
        vaultId: ctx.values.vaultId,
        tagId: workTag.id,
        expectedTagVersionVector: { [ctx.values.deviceId]: 0 },
        tag: {
          name: "Updated work",
          groupId: "topic",
          color: "blue",
          shade: 600,
        },
      }),
    ).rejects.toBeInstanceOf(VaultTagChangedError);

    expect(ctx.vaultSnapshot.persistUnlockedVault).not.toHaveBeenCalled();
  });

  it("refuses to remove a tag while an entry still references it", async () => {
    const ctx = createContext();

    await expect(
      ctx.remove.execute({
        vaultId: ctx.values.vaultId,
        tagId: workTag.id,
        expectedTagVersionVector: workTag.versionVector,
      }),
    ).rejects.toBeInstanceOf(VaultTagInUseError);

    expect(ctx.vaultSnapshot.persistUnlockedVault).not.toHaveBeenCalled();
  });

  it("removes an unused tag with a tombstone and preserves the persisted session boundary", async () => {
    const ctx = createContext();
    saveUnlockedVaultWithEntries(
      ctx.ports,
      ctx.values,
      [firstPasswordEntry],
      standardVaultTags,
    );

    await ctx.remove.execute({
      vaultId: ctx.values.vaultId,
      tagId: personalTag.id,
      expectedTagVersionVector: personalTag.versionVector,
    });

    expect(
      ctx.ports.saved.unlockedVaultSession?.unlockedVault.vault.tags,
    ).toEqual([workTag]);
    expect(
      ctx.ports.saved.unlockedVaultSession?.unlockedVault.vault.deletedTags,
    ).toEqual([
      {
        id: personalTag.id,
        versionVector: { [ctx.values.deviceId]: 2 },
        deletedAt: ctx.values.timestamp,
      },
    ]);
  });

  it("preserves tag state when snapshot persistence fails", async () => {
    const ctx = createContext();
    const original = structuredClone(
      ctx.ports.saved.unlockedVaultSession!.unlockedVault.vault,
    );
    vi.mocked(ctx.vaultSnapshot.persistUnlockedVault).mockRejectedValueOnce(
      new Error("Storage unavailable"),
    );
    await expect(
      ctx.update.execute({
        vaultId: ctx.values.vaultId,
        tagId: workTag.id,
        expectedTagVersionVector: workTag.versionVector,
        tag: { name: "Changed", groupId: "topic", color: "blue", shade: 500 },
      }),
    ).rejects.toThrow("Storage unavailable");
    expect(ctx.ports.saved.unlockedVaultSession!.unlockedVault.vault).toEqual(
      original,
    );
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });

  it.each(["add", "update"] as const)(
    "rejects malformed %s input before restoring secrets",
    async (action) => {
      const ctx = createContext();
      const read = vi.spyOn(
        ctx.ports.sessionServices.unlockedVaultSession,
        "requireUnlockedVaultContext",
      );
      vi.mocked(ctx.ports.ids.generateId).mockClear();
      const tag = {
        name: "",
        groupId: "topic" as const,
        color: "blue" as const,
        shade: 500 as const,
      };
      await expect(
        action === "add"
          ? ctx.add.execute({ vaultId: ctx.values.vaultId, tag })
          : ctx.update.execute({
              vaultId: ctx.values.vaultId,
              tagId: workTag.id,
              expectedTagVersionVector: workTag.versionVector,
              tag,
            }),
      ).rejects.toMatchObject({ name: "InvalidVaultTagError" });
      expect(read).not.toHaveBeenCalled();
      expect(ctx.ports.ids.generateId).not.toHaveBeenCalled();
      expect(ctx.vaultSnapshot.persistUnlockedVault).not.toHaveBeenCalled();
    },
  );

  it("reports tag usage counts without exposing mutable version vectors", async () => {
    const ctx = createContext();

    const result = await ctx.read.execute({ vaultId: ctx.values.vaultId });

    expect(result.tags).toEqual([
      expect.objectContaining({ id: workTag.id, entryCount: 1 }),
      expect.objectContaining({ id: personalTag.id, entryCount: 1 }),
    ]);
    expect(result.tags[0]?.versionVector).not.toBe(workTag.versionVector);
  });
});
