import { describe, expect, it } from "vitest";
import type { Vault } from "../vault/vault";
import {
  firstPasswordEntry,
  secondPasswordEntry,
  standardVaultTags,
} from "../../__tests__/fixtures/vault-entries";
import { entryMatchesSearchQuery } from "./search-entry-query.utils";

const vault: Vault = {
  versionVector: {
    "device-id": 1,
  },
  entries: [firstPasswordEntry, secondPasswordEntry],
  deletedEntries: [],
  deviceProfiles: [],
  deletedDeviceProfiles: [],
  tags: standardVaultTags,
  deletedTags: [],
  tagGroups: [],
  folders: [],
  deletedFolders: [],
};

describe("entryMatchesSearchQuery", () => {
  it("matches any mode with OR logic across searchable fields", () => {
    expect(
      entryMatchesSearchQuery(firstPasswordEntry, vault, {
        mode: "any",
        value: "work",
      }),
    ).toBe(true);

    expect(
      entryMatchesSearchQuery(firstPasswordEntry, vault, {
        mode: "any",
        value: "service",
      }),
    ).toBe(false);
  });

  it("matches all entries for empty any query", () => {
    expect(
      entryMatchesSearchQuery(firstPasswordEntry, vault, {
        mode: "any",
        value: " ",
      }),
    ).toBe(true);
  });

  it("matches fields mode with AND logic across populated fields", () => {
    expect(
      entryMatchesSearchQuery(secondPasswordEntry, vault, {
        mode: "fields",
        login: "second",
        url: "service",
        tag: ["personal-tag"],
        folder: [],
      }),
    ).toBe(true);
  });

  it("requires every requested tag in fields mode", () => {
    expect(
      entryMatchesSearchQuery(secondPasswordEntry, vault, {
        mode: "fields",
        login: "",
        url: "",
        tag: ["personal-tag", "work-tag"],
        folder: [],
      }),
    ).toBe(false);
  });

  it("finds an entry by its folder name and filters by folder identity", () => {
    const organizedEntry = { ...firstPasswordEntry, folderId: "work" };
    const organizedVault: Vault = {
      ...vault,
      entries: [organizedEntry],
      folders: [
        {
          id: "work",
          name: "Client Work",
          icon: "briefcase",
          parentId: null,
          createdAt: 1,
          versionVector: { "device-id": 1 },
        },
      ],
    };

    expect(
      entryMatchesSearchQuery(organizedEntry, organizedVault, {
        mode: "any",
        value: "client work",
      }),
    ).toBe(true);
    expect(
      entryMatchesSearchQuery(organizedEntry, organizedVault, {
        mode: "fields",
        login: "",
        url: "",
        tag: [],
        folder: ["work"],
      }),
    ).toBe(true);
  });
});
