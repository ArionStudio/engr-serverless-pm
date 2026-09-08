import type { PopupSyncCapabilities } from "@/ui/entrypoints/popup/popup-sync.type";
import { syncReview } from "./sync-fixture";

export type PopupSyncScenario =
  | "sync-current"
  | "sync-changed-during-check"
  | "sync-review"
  | "sync-off"
  | "sync-permission"
  | "sync-error"
  | "sync-upload"
  | "sync-pending"
  | "sync-checking"
  | "sync-upload-refresh-error"
  | "sync-apply-refresh-error"
  | "sync-pending-refresh-error";
export function galleryPopupSync(
  scenario: PopupSyncScenario = "sync-current",
): PopupSyncCapabilities {
  let notify: Parameters<PopupSyncCapabilities["subscribe"]>[0] = () => {};
  let reads = 0;
  let applied = false;
  let uploaded = false;
  const refreshFails = scenario.endsWith("refresh-error");
  const pending =
    scenario === "sync-pending" || scenario === "sync-pending-refresh-error";
  const needsReview =
    scenario === "sync-review" || scenario === "sync-apply-refresh-error";
  return {
    inspect: async () => {
      if (++reads === 2 && scenario === "sync-changed-during-check")
        notify("data");
      if (refreshFails && (uploaded || applied))
        throw new Error("Status unavailable");
      return {
        version: { desktop: applied ? 2 : 1 },
        configured: scenario !== "sync-off",
        access: scenario !== "sync-permission",
        removalPending: false,
      };
    },
    review: async () => {
      if (scenario === "sync-checking") return new Promise(() => {});
      if (scenario === "sync-error") throw new Error("Unavailable");
      if (
        (scenario === "sync-upload" ||
          scenario === "sync-upload-refresh-error" ||
          pending) &&
        !uploaded
      ) {
        const error = new Error("Upload required");
        error.name = "LocalVaultSnapshotAheadError";
        throw error;
      }
      const result = structuredClone(syncReview);
      if (!needsReview || applied) {
        const identity = applied
          ? result.reviewedSnapshotIdentities.remote
          : result.reviewedSnapshotIdentities.local;
        return {
          ...result,
          review: null,
          relation: "equal",
          reviewedSnapshotIdentities: { local: identity, remote: identity },
        };
      }
      return result;
    },
    upload: async () => {
      uploaded = true;
      return {
        syncUpload: pending ? "pending" : "complete",
      };
    },
    apply: async () => {
      applied = true;
      return { syncUpload: "complete" };
    },
    subscribe: (listener) => {
      notify = listener;
      return () => {
        notify = () => {};
      };
    },
  };
}
