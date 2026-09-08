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
      tagReviews: [
        {
          tagId: 1,
          relation: "remote_ahead",
          preselectedAction: "use_remote",
          localTag: {
            state: "tag",
            tag: { id: 1, name: "Personal", versionVector: { desktop: 1 } },
          },
          remoteTag: {
            state: "tag",
            tag: { id: 1, name: "Private", versionVector: { desktop: 2 } },
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
export type SyncScenario =
  | "sync-setup"
  | "sync-access-pending"
  | "sync-saved-refresh-error"
  | "sync-configured"
  | "sync-pending"
  | "sync-error"
  | "sync-session-expired"
  | "sync-review"
  | "sync-revision"
  | "sync-repair-error"
  | "sync-loading";
export function gallerySync(
  scenario: SyncScenario = "sync-setup",
): SyncCapabilities {
  let target: SyncLocation | null =
    scenario === "sync-setup" ||
    scenario === "sync-access-pending" ||
    scenario === "sync-saved-refresh-error"
      ? null
      : { ...syncLocation };
  let refreshFailure = false;
  return {
    origin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
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
      target = {
        bucket: input.bucket,
        region: input.region,
        prefix: input.prefix,
      };
      refreshFailure = scenario === "sync-saved-refresh-error";
      return { syncUpload: "complete" };
    },
    repair: async () => {
      if (scenario === "sync-repair-error") throw new Error("S3 unavailable");
    },
    upload: async () => {
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
              tagReviews: [],
              deviceProfileReviews: [],
            },
            readOnly: syncReview.review!.readOnly,
          },
        };
      return scenario === "sync-review"
        ? syncReview
        : { ...syncReview, relation: "equal", review: null };
    },
    apply: async () => ({ syncUpload: "complete" }),
    subscribe: () => () => {},
  };
}
