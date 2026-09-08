import { VAULT_TAG_SOFT_LIMIT, type ReadTagsResult } from "@lfspm/core";
import type { TagManagementCapabilities } from "@/ui/features/tags";
import { tagGroupPresentations } from "@/ui/features/tags";

export type TagManagementScenario =
  | "tags"
  | "tags-empty"
  | "tags-loading"
  | "tags-live-groups"
  | "tags-mutation-error"
  | "tags-read-retry"
  | "tags-error"
  | "tags-authorization-lost";

export function galleryTagManagement(
  scenario: TagManagementScenario = "tags",
): TagManagementCapabilities {
  let tags: ReadTagsResult["tags"] =
    scenario === "tags-empty"
      ? []
      : [
          {
            id: "tag-personal",
            name: "Personal",
            groupId: "other",
            color: "purple",
            shade: 500,
            createdAt: 1,
            versionVector: { gallery: 1 },
            entryCount: 1,
          },
          {
            id: "tag-mfa",
            name: "MFA enabled",
            groupId: "status",
            color: "green",
            shade: 500,
            createdAt: 2,
            versionVector: { gallery: 1 },
            entryCount: 0,
          },
        ];

  function result(tagId: string) {
    return {
      tagId,
      snapshotVersionVector: { gallery: 2 },
      revisionTimestamp: 2,
      syncConfigured: true,
      syncUpload: "complete" as const,
      softLimitReached: tags.length >= VAULT_TAG_SOFT_LIMIT,
    };
  }

  let readFailed = false;
  return {
    read: async () => {
      if (scenario === "tags-read-retry" && !readFailed) {
        readFailed = true;
        throw new Error("Temporary read failure");
      }
      if (scenario === "tags-loading") return new Promise(() => {});
      if (scenario === "tags-error") throw new Error("Unavailable");
      return {
        tags: structuredClone(tags),
        tagGroups: structuredClone(tagGroupPresentations).map((group) =>
          scenario === "tags-live-groups" && group.id === "status"
            ? {
                ...group,
                name: "Account status",
                description: "Security and account readiness",
                icon: "shield",
                baseColor: "green" as const,
              }
            : group,
        ),
        softLimit: VAULT_TAG_SOFT_LIMIT,
        softLimitReached: tags.length >= VAULT_TAG_SOFT_LIMIT,
      };
    },
    add: async ({ tag }) => {
      const id = `tag-${tag.name.toLowerCase().replaceAll(" ", "-")}`;
      tags = [
        ...tags,
        {
          ...tag,
          id,
          createdAt: Date.now(),
          versionVector: { gallery: 1 },
          entryCount: 0,
        },
      ];
      return result(id);
    },
    update: async ({ tagId, tag }) => {
      if (scenario === "tags-mutation-error") throw new Error("Save failed");
      if (scenario === "tags-authorization-lost") {
        const error = new Error("Gallery session ended");
        error.name = "UnlockedVaultSessionExpiredError";
        throw error;
      }
      tags = tags.map((current) =>
        current.id === tagId
          ? {
              ...current,
              ...tag,
              versionVector: { gallery: 2 },
            }
          : current,
      );
      return result(tagId);
    },
    remove: async ({ tagId }) => {
      tags = tags.filter((tag) => tag.id !== tagId);
      return result(tagId);
    },
    subscribe: () => () => {},
  };
}
