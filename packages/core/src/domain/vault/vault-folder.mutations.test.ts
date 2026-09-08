import { describe, expect, it } from "vitest";
import type { Folder, FolderInput } from "../organization/folder.type";
import { createDefaultTagGroups } from "../organization/tag-group.defaults";
import type { Vault } from "./vault";
import {
  addFolderToVault,
  moveFolderInVault,
  removeFolderFromVault,
} from "./vault-folder.mutations";
import {
  DuplicateVaultFolderNameError,
  VaultFolderCycleError,
  VaultFolderNotEmptyError,
} from "../../errors/vault-organization.errors";
import { requireValidVaultOrganization } from "./vault-organization-reference.policy";

function folder(
  id: string,
  name: string,
  parentId: string | null = null,
): Folder {
  return {
    id,
    name,
    parentId,
    icon: "folder",
    createdAt: 1,
    versionVector: { device: 1 },
  };
}

function vault(folders: Folder[] = []): Vault {
  return {
    versionVector: { device: 1 },
    entries: [],
    deletedEntries: [],
    deviceProfiles: [],
    deletedDeviceProfiles: [],
    tags: [],
    deletedTags: [],
    tagGroups: createDefaultTagGroups(),
    folders,
    deletedFolders: [],
  };
}

describe("vault folder mutations", () => {
  it("keeps root-level names separate from children of a folder whose id is root", () => {
    const current = vault([
      folder("root", "Work"),
      folder("root-mail", "Mail"),
      folder("child-mail", "Mail", "root"),
    ]);
    expect(() => requireValidVaultOrganization(current)).not.toThrow();
  });
  it("allows unlimited valid nesting while rejecting normalized sibling duplicates", () => {
    const first = addFolderToVault(
      vault(),
      {
        id: "work",
        name: "Work",
        icon: "briefcase",
        parentId: null,
        createdAt: 1,
      },
      "device",
    );
    const nestedInput: FolderInput = {
      id: "deep",
      name: "Deep",
      icon: "folder",
      parentId: "work",
      createdAt: 1,
    };
    const nested = addFolderToVault(first, nestedInput, "device");

    expect(nested.folders.at(-1)?.parentId).toBe("work");
    expect(() =>
      addFolderToVault(
        nested,
        { ...nestedInput, id: "duplicate", name: "  DEEP  " },
        "device",
      ),
    ).toThrow(DuplicateVaultFolderNameError);
  });

  it("rejects moving a folder below one of its descendants", () => {
    const current = vault([
      folder("parent", "Parent"),
      folder("child", "Child", "parent"),
    ]);

    expect(() =>
      moveFolderInVault(current, "parent", "child", "device"),
    ).toThrow(VaultFolderCycleError);
  });

  it("deletes only an empty folder and records a causal tombstone", () => {
    const current = vault([
      folder("parent", "Parent"),
      folder("child", "Child", "parent"),
    ]);

    expect(() => removeFolderFromVault(current, "parent", "device", 2)).toThrow(
      VaultFolderNotEmptyError,
    );

    const removed = removeFolderFromVault(current, "child", "device", 2);
    expect(removed.folders.map((item) => item.id)).toEqual(["parent"]);
    expect(removed.deletedFolders).toEqual([
      { id: "child", deletedAt: 2, versionVector: { device: 2 } },
    ]);
  });
});
