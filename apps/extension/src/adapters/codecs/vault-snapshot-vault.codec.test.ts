import type { Folder, Vault } from "@lfspm/core";
import { describe, expect, it } from "vitest";
import {
  InvalidVaultSnapshotPayloadError,
  decodeVault,
  encodeVault,
} from "./vault-snapshot.codec";

function createVault(): Vault {
  return {
    versionVector: { "device-id": 2 },
    entries: [
      {
        id: "entry-id",
        login: "user@example.com",
        password: "password",
        sanitizedUrl: "https://example.com",
        tags: ["work-tag"],
        folderId: "uncategorized",
        versionVector: { "device-id": 2 },
      },
    ],
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
        versionVector: { "device-id": 2 },
      },
    ],
    deletedTags: [],
    tagGroups: [
      {
        id: "topic",
        name: "Topic",
        icon: "tag",
        baseColor: "blue",
      },
    ],
    folders: [],
    deletedFolders: [],
  };
}

describe("vault payload tag codec", () => {
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
      versionVector: { "device-id": 2 },
    };
  }

  it.each(["tags", "tagGroups", "folders"] as const)(
    "rejects normalized duplicate %s names from a decoded payload",
    (kind) => {
      const vault = createVault();
      if (kind === "tags")
        vault.tags.push({
          ...vault.tags[0]!,
          id: "other-tag",
          name: "ＷＯＲＫ",
        });
      else if (kind === "tagGroups")
        vault.tagGroups.push({
          ...vault.tagGroups[0]!,
          id: "other",
          name: "ＴＯＰＩＣ",
        });
      else
        vault.folders = [folder("first", "Work"), folder("second", "ＷＯＲＫ")];
      expect(() => decodeVault(encodeVault(vault))).toThrow(
        InvalidVaultSnapshotPayloadError,
      );
    },
  );

  it("permits the same folder name under distinct parents including the literal root id", () => {
    const vault = createVault();
    vault.folders = [
      folder("root", "Work"),
      folder("mail", "Mail"),
      folder("child-mail", "Mail", "root"),
    ];
    expect(decodeVault(encodeVault(vault))).toEqual(vault);
  });
  it("round-trips tag metadata and string references", () => {
    const vault = createVault();

    expect(decodeVault(encodeVault(vault))).toEqual(vault);
  });

  it("rejects the pre-release numeric tag representation", () => {
    const encoded = encodeVault(createVault()) as {
      entries: Array<{ tags: unknown[] }>;
    };
    encoded.entries[0]!.tags = [1];

    expect(() => decodeVault(encoded)).toThrow(
      InvalidVaultSnapshotPayloadError,
    );
  });

  it("rejects an entry reference to a tag absent from the payload", () => {
    const encoded = encodeVault(createVault()) as {
      tags: unknown[];
    };
    encoded.tags = [];

    expect(() => decodeVault(encoded)).toThrow(
      InvalidVaultSnapshotPayloadError,
    );
  });
});

it.each([
  ["deletedTags", " padded "],
  ["deletedTags", "x".repeat(129)],
  ["deletedFolders", " padded "],
  ["deletedFolders", "x".repeat(129)],
  ["deletedFolders", "uncategorized"],
] as const)("rejects invalid %s identity %s", (kind, id) => {
  const vault = createVault();
  vault[kind] = [{ id, versionVector: { "device-id": 2 }, deletedAt: 2 }];
  expect(() => decodeVault(encodeVault(vault))).toThrow(
    InvalidVaultSnapshotPayloadError,
  );
});

it("round-trips valid organization tombstones", () => {
  const vault = createVault();
  vault.deletedTags = [
    { id: "removed-tag", versionVector: { "device-id": 2 }, deletedAt: 2 },
  ];
  vault.deletedFolders = [
    { id: "removed-folder", versionVector: { "device-id": 2 }, deletedAt: 2 },
  ];
  expect(decodeVault(encodeVault(vault))).toEqual(vault);
});
