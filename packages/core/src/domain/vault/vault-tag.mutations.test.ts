import { describe, expect, it } from "vitest";
import {
  DuplicateVaultTagNameError,
  VaultTagInUseError,
} from "../../errors/vault-tag.errors";
import type { Vault } from "./vault";
import {
  addTagToVault,
  removeTagFromVault,
  updateTagInVault,
} from "./vault-tag.mutations";

function createVault(): Vault {
  return {
    versionVector: { A: 7 },
    entries: [],
    deletedEntries: [],
    deviceProfiles: [],
    deletedDeviceProfiles: [],
    tags: [
      {
        id: "work-tag",
        name: "Work",
        groupId: "topic",
        color: "blue",
        shade: 500,
        createdAt: 1,
        versionVector: { A: 2 },
      },
    ],
    deletedTags: [],
    tagGroups: [],
    folders: [],
    deletedFolders: [],
  };
}

describe("vault tag mutations", () => {
  it("adds and updates tag metadata while advancing its causal version", () => {
    const added = addTagToVault(
      createVault(),
      {
        id: "production-tag",
        name: "Production",
        groupId: "environment",
        color: "red",
        shade: 600,
        createdAt: 2,
      },
      "A",
    );
    const updated = updateTagInVault(
      added,
      "production-tag",
      {
        name: "Production systems",
        groupId: "environment",
        color: "orange",
        shade: 700,
      },
      "A",
    );

    expect(updated.tags.at(-1)).toEqual({
      id: "production-tag",
      name: "Production systems",
      groupId: "environment",
      color: "orange",
      shade: 700,
      createdAt: 2,
      versionVector: { A: 9 },
    });
    expect(updated.versionVector).toEqual({ A: 9 });
  });

  it("rejects names that duplicate another tag after normalization", () => {
    expect(() =>
      addTagToVault(
        createVault(),
        {
          id: "duplicate-tag",
          name: "  work  ",
          groupId: "other",
          color: "gray",
          shade: 500,
          createdAt: 2,
        },
        "A",
      ),
    ).toThrow(DuplicateVaultTagNameError);
  });

  it("refuses to remove a tag referenced by an entry", () => {
    const vault = createVault();
    vault.entries = [
      {
        id: "entry-id",
        login: "user@example.com",
        password: "password",
        sanitizedUrl: "https://example.com",
        folderId: "uncategorized",
        tags: ["work-tag"],
        versionVector: { A: 2 },
      },
    ];

    expect(() => removeTagFromVault(vault, "work-tag", "A", 4)).toThrow(
      VaultTagInUseError,
    );
  });

  it("removes an unused tag by creating a causal tombstone", () => {
    const result = removeTagFromVault(createVault(), "work-tag", "A", 4);

    expect(result.tags).toEqual([]);
    expect(result.versionVector).toEqual({ A: 8 });
    expect(result.deletedTags).toEqual([
      {
        id: "work-tag",
        versionVector: { A: 3 },
        deletedAt: 4,
      },
    ]);
  });
});
