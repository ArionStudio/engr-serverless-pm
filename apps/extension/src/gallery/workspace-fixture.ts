import {
  UNCATEGORIZED_FOLDER_ID,
  VAULT_TAG_SOFT_LIMIT,
  globalLibrarySchema,
  type PasswordEntry,
  type VisibleVaultFields,
} from "@lfspm/core";
import type { WorkspaceCapabilities } from "@/ui/features/entries/workspace.type";
import { exampleEntry, entryToolsFixture } from "./entry-tools-fixture";
import organizationLibrary from "@/assets/data/global-library.json";

export type WorkspaceScenario =
  | "workspace"
  | "workspace-empty"
  | "workspace-loading"
  | "workspace-error"
  | "workspace-reveal-error"
  | "workspace-inline-refresh-error"
  | "workspace-stale"
  | "workspace-uploaded"
  | "workspace-pending-upload"
  | "workspace-saved-refresh-error";
export function galleryWorkspace(
  state: WorkspaceScenario = "workspace",
): WorkspaceCapabilities {
  let tags: VisibleVaultFields["tags"] = [
    {
      id: "tag-personal",
      name: "Personal",
      groupId: "other",
      color: "purple",
      shade: 500,
      createdAt: 1,
    },
  ];
  let folders: VisibleVaultFields["folders"] = [];
  let entries: PasswordEntry[] =
    state === "workspace-empty"
      ? []
      : [
          {
            ...exampleEntry,
            folderId: "uncategorized",
            password: "Gallery-River-8!Pine-Sky",
            versionVector: { gallery: 1 },
          },
        ];
  const syncConfigured =
    state === "workspace-pending-upload" || state === "workspace-uploaded";
  let refreshFailure = false;
  function find(id: string) {
    const entry = entries.find((item) => item.id === id);
    if (!entry) {
      const error = new Error("Missing");
      error.name = "PasswordEntryNotFoundError";
      throw error;
    }
    return entry;
  }
  function result(id: string) {
    refreshFailure =
      state === "workspace-saved-refresh-error" ||
      state === "workspace-inline-refresh-error";
    return {
      entryId: id,
      snapshotVersionVector: { gallery: 2 },
      revisionTimestamp: 2,
      syncConfigured,
      syncUpload:
        state === "workspace-pending-upload"
          ? ("pending" as const)
          : ("complete" as const),
    };
  }
  return {
    dismissCapturedLogin: async () => {},
    readActivePageUrl: async () => "https://mail.example.test/sign-in",
    read: async () => {
      if (refreshFailure) {
        refreshFailure = false;
        throw new Error("Could not read local session data");
      }
      if (state === "workspace-loading") return new Promise(() => {});
      if (state === "workspace-error") throw new Error("Unavailable");
      return {
        entries: entries.map(
          ({ id, login, sanitizedUrl, tags, folderId, password }) => ({
            id,
            hasPassword: password.length > 0,
            login,
            sanitizedUrl,
            tags: [...tags],
            folderId,
          }),
        ),
        tags: structuredClone(tags),
        tagGroups: [
          {
            id: "other",
            name: "Other",
            icon: "hash",
            baseColor: "gray",
            description: "Custom context",
          },
        ],
        folders: structuredClone(folders),
        deviceProfiles: [],
        syncConfigured,
      };
    },
    details: async (_, id) => {
      const entry = find(id);
      return {
        entry: {
          id: entry.id,
          hasPassword: entry.password.length > 0,
          login: entry.login,
          sanitizedUrl: entry.sanitizedUrl,
          tags: [...entry.tags],
          folderId: entry.folderId ?? UNCATEGORIZED_FOLDER_ID,
        },
        entryVersionVector: { ...entry.versionVector },
      };
    },
    edit: async (_, id) => {
      if (state === "workspace-reveal-error")
        throw new Error("Repository unavailable");
      return { entry: structuredClone(find(id)) };
    },
    copy: async () => {},
    tools: entryToolsFixture,
    add: async ({ entry }) => {
      const id = `gallery-${entries.length + 1}`;
      entries = [
        ...entries,
        {
          id,
          login: entry.login,
          sanitizedUrl: entry.url,
          password: entry.password,
          tags: [...entry.tags],
          folderId: entry.folderId ?? UNCATEGORIZED_FOLDER_ID,
          versionVector: { gallery: 1 },
        },
      ];
      return result(id);
    },
    update: async ({ entryId, entry }) => {
      if (state === "workspace-stale") {
        const error = new Error("Changed");
        error.name = "PasswordEntryChangedError";
        throw error;
      }
      entries = entries.map((previous) =>
        previous.id === entryId
          ? {
              ...previous,
              login: entry.login,
              password: entry.password,
              sanitizedUrl: entry.url,
              tags: [...entry.tags],
              folderId: entry.folderId ?? previous.folderId,
              versionVector: { gallery: 2 },
            }
          : previous,
      );
      return result(entryId);
    },
    remove: async ({ entryId }) => {
      entries = entries.filter((entry) => entry.id !== entryId);
      return result(entryId);
    },
    createTag: async ({ tag }) => {
      const tagId = `tag-${tag.name.toLowerCase().replaceAll(" ", "-")}`;
      tags = [...tags, { ...tag, id: tagId, createdAt: Date.now() }];
      const save = result(tagId);
      return {
        tagId,
        snapshotVersionVector: { gallery: 2 },
        revisionTimestamp: 2,
        syncConfigured: save.syncConfigured,
        syncUpload: save.syncUpload,
        softLimitReached: tags.length >= VAULT_TAG_SOFT_LIMIT,
      };
    },
    createFolder: async ({ folder }) => {
      const folderId = `folder-${folder.name.toLowerCase().replaceAll(" ", "-")}`;
      folders = [
        ...folders,
        {
          id: folderId,
          name: folder.name,
          icon: folder.icon,
          parentId: folder.parentId,
          createdAt: Date.now(),
          ...(folder.description === undefined
            ? {}
            : { description: folder.description }),
        },
      ];
      const save = result(folderId);
      return {
        folderId,
        snapshotVersionVector: { gallery: 2 },
        revisionTimestamp: 2,
        syncConfigured: save.syncConfigured,
        syncUpload: save.syncUpload,
      };
    },
    readOrganizationLibrary: async () =>
      globalLibrarySchema.parse(organizationLibrary),
    subscribe: () => () => {},
  };
}
