import type { PasswordEntry } from "@lfspm/core";
import type { WorkspaceCapabilities } from "@/ui/features/entries/workspace.type";
import { exampleEntry, entryToolsFixture } from "./entry-tools-fixture";

export type WorkspaceScenario =
  | "workspace"
  | "workspace-empty"
  | "workspace-loading"
  | "workspace-error"
  | "workspace-stale"
  | "workspace-uploaded"
  | "workspace-pending-upload"
  | "workspace-saved-refresh-error";
export function galleryWorkspace(
  state: WorkspaceScenario = "workspace",
): WorkspaceCapabilities {
  let entries: PasswordEntry[] =
    state === "workspace-empty"
      ? []
      : [
          {
            ...exampleEntry,
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
    refreshFailure = state === "workspace-saved-refresh-error";
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
    read: async () => {
      if (refreshFailure) {
        refreshFailure = false;
        throw new Error("Could not read local session data");
      }
      if (state === "workspace-loading") return new Promise(() => {});
      if (state === "workspace-error") throw new Error("Unavailable");
      return {
        entries: entries.map(({ id, login, sanitizedUrl, tags }) => ({
          id,
          login,
          sanitizedUrl,
          tags: [...tags],
        })),
        tags: [{ id: 1, name: "Personal" }],
        deviceProfiles: [],
        syncConfigured,
      };
    },
    details: async (_, id) => {
      const entry = find(id);
      return {
        entry: {
          id: entry.id,
          login: entry.login,
          sanitizedUrl: entry.sanitizedUrl,
          tags: [...entry.tags],
        },
        entryVersionVector: { ...entry.versionVector },
      };
    },
    edit: async (_, id) => ({ entry: structuredClone(find(id)) }),
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
    subscribe: () => () => {},
  };
}
