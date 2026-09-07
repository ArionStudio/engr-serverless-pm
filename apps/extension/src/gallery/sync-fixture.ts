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
  | "sync-configured"
  | "sync-pending"
  | "sync-error"
  | "sync-review"
  | "sync-loading";
export function gallerySync(
  scenario: SyncScenario = "sync-setup",
): SyncCapabilities {
  let target: SyncLocation | null =
    scenario === "sync-setup" ? null : { ...syncLocation };
  return {
    origin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
    copySetupText: async () => {},
    inspect: async () =>
      scenario === "sync-loading" ? new Promise(() => {}) : target,
    test: async () => {},
    configure: async (_vaultId, input) => {
      target = {
        bucket: input.bucket,
        region: input.region,
        prefix: input.prefix,
      };
      return { syncUpload: "complete" };
    },
    repair: async () => {},
    upload: async () => {
      if (scenario === "sync-error") throw new Error("S3 unavailable");
      return {
        syncUpload: scenario === "sync-pending" ? "pending" : "complete",
      };
    },
    review: async () => {
      if (scenario === "sync-error") throw new Error("S3 unavailable");
      return scenario === "sync-review"
        ? syncReview
        : { ...syncReview, relation: "equal", review: null };
    },
    apply: async () => ({ syncUpload: "complete" }),
    subscribe: () => () => {},
  };
}
