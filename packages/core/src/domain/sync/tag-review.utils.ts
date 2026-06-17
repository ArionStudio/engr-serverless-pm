import { InvalidVaultSyncReviewError } from "../../errors";
import { areJsonEqual } from "../common";
import type { Vault } from "../vault";
import type { ReviewableTag, TagReviewItem } from "./tag-review.type";
import type { VaultSyncItemRelation } from "./vault-sync-item-review.type";

export function findChangedTags(
  localVault: Vault,
  remoteVault: Vault,
): TagReviewItem[] {
  const tagReviews: TagReviewItem[] = [];

  for (const tagId of findAllTagsIds(localVault, remoteVault)) {
    const localTag = findTag(localVault, tagId);
    const remoteTag = findTag(remoteVault, tagId);
    const relation = getTagRelation(localTag, remoteTag);

    if (relation === "broken") {
      throw new InvalidVaultSyncReviewError(
        `Tag "${tagId}" has an invalid local/remote sync relation.`,
      );
    }

    if (relation === "equal") {
      continue;
    }

    tagReviews.push({
      tagId,
      relation,
      preselectedAction: "use_remote",
      localTag,
      remoteTag,
    });
  }

  return tagReviews;
}

function findTag(vault: Vault, tagId: number): ReviewableTag {
  const tag = vault.tags.find((tag) => tag.id === tagId);
  const deletedTag = vault.deletedTags.find(
    (deletedTag) => deletedTag.id === tagId,
  );

  if (tag !== undefined && deletedTag !== undefined) {
    throw new InvalidVaultSyncReviewError(
      `Tag "${tagId}" exists as both active and deleted in the same vault.`,
    );
  }

  if (tag !== undefined) {
    return {
      tag,
      state: "tag",
    };
  }

  if (deletedTag !== undefined) {
    return {
      deletedTag,
      state: "deleted",
    };
  }

  return {
    state: "missing",
  };
}

function getTagRelation(
  localTag: ReviewableTag,
  remoteTag: ReviewableTag,
): VaultSyncItemRelation {
  if (areJsonEqual(localTag, remoteTag)) {
    return "equal";
  }

  if (localTag.state === "missing" && remoteTag.state === "missing") {
    return "broken";
  }

  if (localTag.state === "missing") {
    return "remote_only";
  }

  if (remoteTag.state === "missing") {
    return "broken";
  }

  const localVersionVector =
    localTag.state === "tag"
      ? localTag.tag.versionVector
      : localTag.deletedTag.versionVector;
  const remoteVersionVector =
    remoteTag.state === "tag"
      ? remoteTag.tag.versionVector
      : remoteTag.deletedTag.versionVector;

  let remoteHasNewerComponent = false;
  const deviceIds = new Set([
    ...Object.keys(localVersionVector),
    ...Object.keys(remoteVersionVector),
  ]);

  for (const deviceId of deviceIds) {
    const localValue = localVersionVector[deviceId] ?? 0;
    const remoteValue = remoteVersionVector[deviceId] ?? 0;

    if (localValue > remoteValue) {
      return "broken";
    }

    if (remoteValue > localValue) {
      remoteHasNewerComponent = true;
    }
  }

  if (remoteHasNewerComponent) {
    return "remote_ahead";
  }

  return "broken";
}

export function findAllTagsIds(
  localVault: Vault,
  remoteVault: Vault,
): Set<number> {
  return new Set([
    ...localVault.tags.map((tag) => tag.id),
    ...remoteVault.tags.map((tag) => tag.id),
    ...localVault.deletedTags.map((deletedTag) => deletedTag.id),
    ...remoteVault.deletedTags.map((deletedTag) => deletedTag.id),
  ]);
}
