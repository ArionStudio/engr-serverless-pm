import type { PrepareSyncReviewResult, VaultSyncResolution } from "@lfspm/core";
import type { Comparison, Resolution } from "./sync-review.view";

type Review = NonNullable<PrepareSyncReviewResult["review"]>["actionable"];
function entryText(
  value: Review["entryReviews"][number]["localEntry"],
): string {
  if (value.state === "missing") return "Not on this device";
  if (value.state === "deleted") return "Deleted";
  return `${value.entry.login} · ${value.entry.sanitizedUrl} · Tags: ${value.entry.tags.join(", ") || "none"}`;
}
function tagText(value: Review["tagReviews"][number]["localTag"]): string {
  return value.state === "missing"
    ? "Absent"
    : value.state === "deleted"
      ? "Deleted"
      : value.tag.name;
}
function deviceText(
  value: Review["deviceProfileReviews"][number]["localDeviceProfile"],
): string {
  return value.state === "missing"
    ? "Absent"
    : value.state === "deleted"
      ? "Deleted"
      : value.deviceProfile.name;
}
function allowed(relation: string): readonly Resolution[] {
  return relation === "remote_only"
    ? ["use_remote"]
    : ["use_local", "use_remote"];
}
export function comparisons(result: PrepareSyncReviewResult): Comparison[] {
  const review = result.review?.actionable;
  if (!review) return [];
  return [
    ...review.entryReviews.map((row) => ({
      id: `entry:${row.entryId}`,
      label: "Entry",
      local: entryText(row.localEntry),
      remote: entryText(row.remoteEntry),
      passwordChanged: row.passwordChanged,
      allowed: allowed(row.relation),
    })),
    ...review.tagReviews.map((row) => ({
      id: `tag:${row.tagId}`,
      label: "Tag",
      local: tagText(row.localTag),
      remote: tagText(row.remoteTag),
      passwordChanged: false,
      allowed: allowed(row.relation),
    })),
    ...review.deviceProfileReviews.map((row) => ({
      id: `device:${row.deviceId}`,
      label: "Device name",
      local: deviceText(row.localDeviceProfile),
      remote: deviceText(row.remoteDeviceProfile),
      passwordChanged: false,
      allowed: allowed(row.relation),
    })),
  ];
}
export function resolutionFromChoices(
  result: PrepareSyncReviewResult,
  choices: Readonly<Record<string, Resolution>>,
): VaultSyncResolution {
  const review = result.review?.actionable;
  if (
    !review ||
    comparisons(result).some((row) => !row.allowed.includes(choices[row.id]))
  )
    throw new Error("Incomplete review");
  return {
    entryResolutions: review.entryReviews.map(({ entryId }) => ({
      entryId,
      action: choices[`entry:${entryId}`],
    })),
    tagResolutions: review.tagReviews.map(({ tagId }) => ({
      tagId,
      action: choices[`tag:${tagId}`],
    })),
    deviceProfileResolutions: review.deviceProfileReviews.map(
      ({ deviceId }) => ({ deviceId, action: choices[`device:${deviceId}`] }),
    ),
  };
}
