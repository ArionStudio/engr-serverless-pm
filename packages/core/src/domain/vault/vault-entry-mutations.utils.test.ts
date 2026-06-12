import { describe, expect, it } from "vitest";
import type { Vault } from "./vault";
import { DuplicateVaultEntryError } from "./vault-entry.errors";
import {
  addPasswordEntryToVault,
  removePasswordEntryFromVault,
  updatePasswordEntryInVault,
} from "./vault-entry-mutations.utils";

function createVault(): Vault {
  return {
    versionVector: { A: 7 },
    entries: [
      {
        id: "entry-id",
        login: "user@example.com",
        password: "password",
        sanitizedUrl: "https://example.com",
        tags: [],
        versionVector: { A: 2 },
      },
    ],
    deletedEntries: [],
    deviceProfiles: [],
    deletedDeviceProfiles: [],
    tags: [],
    deletedTags: [],
  };
}

describe("vault entry mutation utils", () => {
  it("adds an entry and increments vault and entry vectors for the device", () => {
    expect(
      addPasswordEntryToVault(
        createVault(),
        "new-entry-id",
        {
          login: "new@example.com",
          password: "new-password",
          sanitizedUrl: "https://new.example.com",
          tags: [1],
        },
        "A",
      ),
    ).toEqual({
      ...createVault(),
      versionVector: { A: 8 },
      entries: [
        ...createVault().entries,
        {
          id: "new-entry-id",
          login: "new@example.com",
          password: "new-password",
          sanitizedUrl: "https://new.example.com",
          tags: [1],
          versionVector: { A: 8 },
        },
      ],
    });
  });

  it("rejects adding an active entry with an existing id", () => {
    expect(() =>
      addPasswordEntryToVault(
        createVault(),
        "entry-id",
        {
          login: "duplicate@example.com",
          password: "duplicate-password",
          sanitizedUrl: "https://duplicate.example.com",
          tags: [],
        },
        "A",
      ),
    ).toThrow(DuplicateVaultEntryError);
  });

  it("updates an entry and increments vault and entry vectors for the device", () => {
    expect(
      updatePasswordEntryInVault(
        createVault(),
        "entry-id",
        {
          login: "updated@example.com",
          password: "updated-password",
          sanitizedUrl: "https://updated.example.com",
          tags: [2],
        },
        "A",
      ).entries[0],
    ).toEqual({
      id: "entry-id",
      login: "updated@example.com",
      password: "updated-password",
      sanitizedUrl: "https://updated.example.com",
      tags: [2],
      versionVector: { A: 3 },
    });
  });

  it("re-adds an entry from its tombstone vector", () => {
    const vault = addPasswordEntryToVault(
      {
        ...createVault(),
        entries: [],
        deletedEntries: [
          {
            id: "entry-id",
            versionVector: { A: 2, B: 1 },
            deletedAt: 1,
          },
        ],
      },
      "entry-id",
      {
        login: "restored@example.com",
        password: "restored-password",
        sanitizedUrl: "https://restored.example.com",
        tags: [],
      },
      "A",
    );

    expect(vault.entries).toEqual([
      {
        id: "entry-id",
        login: "restored@example.com",
        password: "restored-password",
        sanitizedUrl: "https://restored.example.com",
        tags: [],
        versionVector: { A: 3, B: 1 },
      },
    ]);
    expect(vault.deletedEntries).toEqual([]);
  });

  it("removes an entry by creating a tombstone", () => {
    const vault = removePasswordEntryFromVault(
      createVault(),
      "entry-id",
      "A",
      1,
    );

    expect(vault.entries).toEqual([]);
    expect(vault.versionVector).toEqual({ A: 8 });
    expect(vault.deletedEntries).toEqual([
      {
        id: "entry-id",
        versionVector: { A: 3 },
        deletedAt: 1,
      },
    ]);
  });
});
