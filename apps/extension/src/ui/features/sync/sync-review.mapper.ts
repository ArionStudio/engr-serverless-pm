import type { PrepareSyncReviewResult, VaultSyncResolution } from "@lfspm/core";
import type { Comparison, Resolution } from "./sync-review.view";

type Review = NonNullable<PrepareSyncReviewResult["review"]>["actionable"];

type NameLookup = ReadonlyMap<string, string>;

function lines(fields: readonly (readonly [label: string, value: string])[]) {
  return fields.map(([label, value]) => `${label}: ${value}`).join("\n");
}

function namedReference(id: string, names: NameLookup): string {
  const name = names.get(id);
  return name ? `${name} (${id})` : id;
}

function folderReference(id: string, names: NameLookup): string {
  return id === "uncategorized" ? "Uncategorized" : namedReference(id, names);
}

function entryText(
  value: Review["entryReviews"][number]["localEntry"],
  tagNames: NameLookup,
  folderNames: NameLookup,
): string {
  if (value.state === "missing") return "Not on this device";
  if (value.state === "deleted") return "Deleted";
  return lines([
    ["Login", value.entry.login],
    ["Website", value.entry.sanitizedUrl],
    ["Folder", folderReference(value.entry.folderId, folderNames)],
    [
      "Tags",
      value.entry.tags.map((id) => namedReference(id, tagNames)).join(", ") ||
        "None",
    ],
    ["Password saved", value.entry.hasPassword ? "Yes" : "No"],
  ]);
}
function tagText(value: Review["tagReviews"][number]["localTag"]): string {
  return value.state === "missing"
    ? "Absent"
    : value.state === "deleted"
      ? "Deleted"
      : lines([
          ["Name", value.tag.name],
          ["Group", value.tag.groupId],
          ["Color", value.tag.color],
          ["Shade", String(value.tag.shade)],
        ]);
}
function folderText(
  value: Review["folderReviews"][number]["localFolder"],
  folderNames: NameLookup,
): string {
  return value.state === "missing"
    ? "Absent"
    : value.state === "deleted"
      ? "Deleted"
      : lines([
          ["Name", value.folder.name],
          [
            "Parent",
            value.folder.parentId === null
              ? "Top level"
              : namedReference(value.folder.parentId, folderNames),
          ],
          ["Icon", value.folder.icon],
          ["Description", value.folder.description || "None"],
        ]);
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
const allowed: Record<
  Review["entryReviews"][number]["relation"],
  readonly Resolution[]
> = {
  remote_only: ["use_remote"],
  remote_ahead: ["use_local", "use_remote"],
};
export function comparisons(result: PrepareSyncReviewResult): Comparison[] {
  const review = result.review?.actionable;
  if (!review) return [];
  return comparisonRows(review);
}
export function comparisonRows(review: Review): Comparison[] {
  const localTagNames = new Map<string, string>();
  const remoteTagNames = new Map<string, string>();
  const localFolderNames = new Map<string, string>();
  const remoteFolderNames = new Map<string, string>();
  for (const row of review.tagReviews) {
    if (row.localTag.state === "tag")
      localTagNames.set(row.tagId, row.localTag.tag.name);
    if (row.remoteTag.state === "tag")
      remoteTagNames.set(row.tagId, row.remoteTag.tag.name);
  }
  for (const row of review.folderReviews) {
    if (row.localFolder.state === "folder")
      localFolderNames.set(row.folderId, row.localFolder.folder.name);
    if (row.remoteFolder.state === "folder")
      remoteFolderNames.set(row.folderId, row.remoteFolder.folder.name);
  }
  return [
    ...review.entryReviews.map((row) => ({
      id: `entry:${row.entryId}`,
      label: "Entry",
      local: entryText(row.localEntry, localTagNames, localFolderNames),
      remote: entryText(row.remoteEntry, remoteTagNames, remoteFolderNames),
      passwordChanged: row.passwordChanged,
      allowed: allowed[row.relation],
    })),
    ...review.tagReviews.map((row) => ({
      id: `tag:${row.tagId}`,
      label: "Tag",
      local: tagText(row.localTag),
      remote: tagText(row.remoteTag),
      passwordChanged: false,
      allowed: allowed[row.relation],
    })),
    ...review.folderReviews.map((row) => ({
      id: `folder:${row.folderId}`,
      label: "Folder",
      local: folderText(row.localFolder, localFolderNames),
      remote: folderText(row.remoteFolder, remoteFolderNames),
      passwordChanged: false,
      allowed: allowed[row.relation],
    })),
    ...review.deviceProfileReviews.map((row) => ({
      id: `device:${row.deviceId}`,
      label: "Device name",
      local: deviceText(row.localDeviceProfile),
      remote: deviceText(row.remoteDeviceProfile),
      passwordChanged: false,
      allowed: allowed[row.relation],
    })),
  ];
}
export function resolutionFromChoices(
  result: PrepareSyncReviewResult,
  choices: Readonly<Record<string, Resolution>>,
): VaultSyncResolution {
  const review = result.review?.actionable;
  if (!review) throw new Error("Incomplete review");
  return resolutionFromReview(review, choices);
}
export function resolutionFromReview(
  review: Review,
  choices: Readonly<Record<string, Resolution>>,
): VaultSyncResolution {
  if (
    comparisonRows(review).some((row) => !row.allowed.includes(choices[row.id]))
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
    folderResolutions: review.folderReviews.map(({ folderId }) => ({
      folderId,
      action: choices[`folder:${folderId}`],
    })),
    deviceProfileResolutions: review.deviceProfileReviews.map(
      ({ deviceId }) => ({ deviceId, action: choices[`device:${deviceId}`] }),
    ),
  };
}
