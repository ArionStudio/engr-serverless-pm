import { UnlockedVaultSessionExpiredError } from "@lfspm/core";
import type { PrepareSyncReviewResult } from "@lfspm/core";
import type {
  SyncCapabilities,
  SyncLocation,
} from "@/ui/features/sync/sync.type";
export const syncLocation: SyncLocation = {
  bucket: "personal-vault",
  region: "eu-central-1",
  prefix: "vault/",
};
export const syncReview: PrepareSyncReviewResult = {
  relation: "remote_ahead",
  reviewedSnapshotIdentities: {
    local: {
      descriptor: {
        vaultId: "gallery-vault",
        snapshotVersionVector: { desktop: 1 },
        revisionTimestamp: 1,
      },
      snapshotDigest: "gallery-local",
    },
    remote: {
      descriptor: {
        vaultId: "gallery-vault",
        snapshotVersionVector: { desktop: 2 },
        revisionTimestamp: 2,
      },
      snapshotDigest: "gallery-remote",
    },
  },
  review: {
    actionable: {
      entryReviews: [],
      folderReviews: [],
      tagReviews: [
        {
          tagId: "tag-personal",
          relation: "remote_ahead",
          preselectedAction: "use_remote",
          localTag: {
            state: "tag",
            tag: {
              id: "tag-personal",
              name: "Personal",
              groupId: "other",
              color: "purple",
              shade: 500,
              createdAt: 1,
              versionVector: { desktop: 1 },
            },
          },
          remoteTag: {
            state: "tag",
            tag: {
              id: "tag-personal",
              name: "Private",
              groupId: "other",
              color: "purple",
              shade: 500,
              createdAt: 1,
              versionVector: { desktop: 2 },
            },
          },
        },
      ],
      deviceProfileReviews: [],
    },
    readOnly: {
      keySlotsChanges: {
        hasChanges: false,
        deviceSlots: {
          addedDeviceIds: [],
          removedDeviceIds: [],
          changedDeviceIds: [],
        },
      },
      providerCredentialRevocationCompleted: false,
    },
  },
};

export const organizationSyncReview: PrepareSyncReviewResult = {
  ...syncReview,
  review: {
    actionable: {
      entryReviews: [
        {
          entryId: "entry-account",
          relation: "remote_ahead",
          preselectedAction: "use_remote",
          localEntry: {
            state: "entry",
            entry: {
              id: "entry-account",
              login: "alex@example.test",
              sanitizedUrl: "https://example.test/sign-in",
              folderId: "folder-personal",
              tags: ["tag-focus"],
              hasPassword: true,
            },
          },
          remoteEntry: {
            state: "entry",
            entry: {
              id: "entry-account",
              login: "alex@example.test",
              sanitizedUrl: "https://example.test/sign-in",
              folderId: "folder-work",
              tags: ["tag-urgent"],
              hasPassword: false,
            },
          },
          passwordChanged: true,
        },
      ],
      tagReviews: [
        {
          tagId: "tag-focus",
          relation: "remote_ahead",
          preselectedAction: "use_remote",
          localTag: {
            state: "tag",
            tag: {
              id: "tag-focus",
              name: "Focus",
              groupId: "topic",
              color: "blue",
              shade: 500,
              createdAt: 1,
              versionVector: { desktop: 1 },
            },
          },
          remoteTag: {
            state: "tag",
            tag: {
              id: "tag-focus",
              name: "Focus",
              groupId: "status",
              color: "orange",
              shade: 700,
              createdAt: 1,
              versionVector: { desktop: 2 },
            },
          },
        },
      ],
      folderReviews: [
        {
          folderId: "folder-projects",
          relation: "remote_ahead",
          preselectedAction: "use_remote",
          localFolder: {
            state: "folder",
            folder: {
              id: "folder-projects",
              name: "Projects",
              parentId: "folder-personal",
              icon: "folder",
              description: "Personal projects",
              createdAt: 1,
              versionVector: { desktop: 1 },
            },
          },
          remoteFolder: {
            state: "folder",
            folder: {
              id: "folder-projects",
              name: "Projects",
              parentId: "folder-work",
              icon: "briefcase",
              description: "Client projects",
              createdAt: 1,
              versionVector: { desktop: 2 },
            },
          },
        },
      ],
      deviceProfileReviews: [],
    },
    readOnly: syncReview.review!.readOnly,
  },
};
export type SyncScenario =
  | "sync-permission"
  | "sync-setup"
  | "sync-access-pending"
  | "sync-saved-refresh-error"
  | "sync-existing"
  | "sync-configured"
  | "sync-copy-session-lost"
  | "sync-pending"
  | "sync-error"
  | "sync-session-expired"
  | "sync-review"
  | "sync-organization-review"
  | "sync-revision"
  | "sync-repair-error"
  | "sync-loading"
  | "sync-revocation-pending"
  | "sync-revocation-denied"
  | "sync-removal-pending"
  | "sync-refresh-error";
export function gallerySync(
  scenario: SyncScenario = "sync-setup",
): SyncCapabilities {
  let target: SyncLocation | null =
    scenario === "sync-setup" ||
    scenario === "sync-access-pending" ||
    scenario === "sync-existing" ||
    scenario === "sync-saved-refresh-error"
      ? null
      : { ...syncLocation };
  let refreshFailure = false;
  let permitted = scenario !== "sync-permission";
  let changed = false;
  let revocationPending =
    scenario === "sync-revocation-pending" ||
    scenario === "sync-revocation-denied";
  return {
    revealAccessKeys: async (_vaultId, password) => {
      if (password !== "gallery") throw new Error("Incorrect password");
      return {
        accessKeyId: "EXAMPLE-ACCESS-KEY",
        secretAccessKey: "example-secret-for-gallery-only",
        sessionId: "gallery-session",
      };
    },
    copyAccessKey: async () => {
      if (scenario === "sync-copy-session-lost")
        throw new UnlockedVaultSessionExpiredError("gallery-vault");
    },
    inspectManagement: async () => {
      if (changed && scenario === "sync-refresh-error")
        throw new Error("Refresh unavailable");
      return {
        providerCredentialRevocationPending: revocationPending,
        syncRemovalPending:
          scenario === "sync-removal-pending" && target !== null,
      };
    },
    disable: async () => {
      changed = true;
      target = null;
    },
    completeCredentialRevocation: async () => {
      if (scenario === "sync-revocation-denied") {
        const error = new Error(
          "AWS denied access without confirming deletion",
        );
        error.name = "S3ReadPermissionRejectedError";
        throw error;
      }
      revocationPending = false;
      return {
        providerCredentialRevocation: "complete",
        syncUpload: "complete",
      };
    },
    prepareEnrollment: async () => ({
      reviewedSnapshotIdentities: syncReview.reviewedSnapshotIdentities,
      enrolledDeviceIds: ["laptop"],
      vaultKeyGeneration: 1,
      review: syncReview.review!.actionable,
    }),
    prepareRevocation: async () => ({
      reviewedSnapshotIdentities: syncReview.reviewedSnapshotIdentities,
      enrolledDeviceIds: [],
      revokedDeviceIds: ["old-phone"],
      vaultKeyGeneration: 2,
      review: syncReview.review!.actionable,
    }),
    acceptEnrollment: async () => ({ syncUpload: "complete" }),
    acceptRevocation: async () => {
      revocationPending = true;
      return { syncUpload: "complete" };
    },
    requestAccess: async () => {
      permitted = true;
    },
    hasAccess: async () => permitted,
    copySetupText: async () => {},
    inspect: async () => {
      if (refreshFailure) {
        refreshFailure = false;
        throw new Error("Configuration unavailable");
      }
      return scenario === "sync-loading" ? new Promise(() => {}) : target;
    },
    test: async () => {
      if (scenario === "sync-access-pending") await new Promise(() => {});
      if (scenario === "sync-repair-error") throw new Error("S3 unavailable");
    },
    configure: async (_vaultId, input) => {
      if (scenario === "sync-existing") {
        return {
          kind: "existing",
          connection: {
            relation: "remote_ahead",
            reviewedSnapshotIdentities: syncReview.reviewedSnapshotIdentities,
          },
        };
      }
      target = {
        bucket: input.bucket,
        region: input.region,
        prefix: input.prefix,
      };
      return {
        kind: "enabled",
        result: { syncUpload: "complete" },
      };
    },
    connectExisting: async (_vaultId, input) => {
      target = {
        bucket: input.bucket,
        region: input.region,
        prefix: input.prefix,
      };
      refreshFailure = scenario === "sync-saved-refresh-error";
      return { syncUpload: "complete" };
    },
    repair: async () => {
      if (scenario === "sync-session-expired")
        throw new UnlockedVaultSessionExpiredError("gallery-vault");
      if (scenario === "sync-repair-error") throw new Error("S3 unavailable");
    },
    upload: async () => {
      changed = true;
      if (scenario === "sync-error") throw new Error("S3 unavailable");
      return {
        syncUpload: scenario === "sync-pending" ? "pending" : "complete",
      };
    },
    review: async () => {
      if (scenario === "sync-session-expired")
        throw new UnlockedVaultSessionExpiredError("gallery-vault");
      if (scenario === "sync-error") throw new Error("S3 unavailable");
      if (scenario === "sync-revision")
        return {
          ...syncReview,
          review: {
            actionable: {
              entryReviews: [],
              folderReviews: [],
              tagReviews: [],
              deviceProfileReviews: [],
            },
            readOnly: syncReview.review!.readOnly,
          },
        };
      if (scenario === "sync-organization-review")
        return organizationSyncReview;
      return scenario === "sync-review"
        ? syncReview
        : { ...syncReview, relation: "equal", review: null };
    },
    apply: async () => ({ syncUpload: "complete" }),
    subscribe: () => () => {},
  };
}
