import { InvalidVaultSyncResolutionError } from "../../errors/sync.errors";
import type { DeletedTag, Tag } from "../entry/tag.type";
import type { Vault } from "../vault/vault";
import type { VersionVector } from "../versioning/version-vector.type";
import {
  incrementVersionVector,
  mergeVersionVectors,
} from "../versioning/version-vector.utils";
import type { ReviewableTag, TagReviewItem } from "./tag-review.type";
import type { TagReviewResolution } from "./tag-resolution.type";
import type { VaultSyncReviewAction } from "./vault-sync-item-review.type";

export function resolveTagStates(
  tagReviews: readonly TagReviewItem[],
  tagResolutions: readonly TagReviewResolution[],
  deviceId: string,
): Map<number, ReviewableTag> {
  const resolutionById = createTagResolutionMap(tagResolutions);
  const resolvedStateById = new Map<number, ReviewableTag>();

  for (const tagResolution of tagResolutions) {
    if (
      !tagReviews.some((tagReview) => tagReview.tagId === tagResolution.tagId)
    ) {
      throw new InvalidVaultSyncResolutionError(
        `Tag "${tagResolution.tagId}" does not require sync resolution.`,
      );
    }
  }

  for (const tagReview of tagReviews) {
    const tagResolution = resolutionById.get(tagReview.tagId);

    if (tagResolution === undefined) {
      throw new InvalidVaultSyncResolutionError(
        `Tag "${tagReview.tagId}" must have a sync resolution.`,
      );
    }

    resolvedStateById.set(
      tagReview.tagId,
      stampTagState(
        selectTagState(tagReview, tagResolution),
        tagReview.localTag,
        tagReview.remoteTag,
        deviceId,
      ),
    );
  }

  return resolvedStateById;
}

export function buildResolvedVaultTags(
  localVault: Vault,
  remoteVault: Vault,
  resolvedStateById: ReadonlyMap<number, ReviewableTag>,
): {
  readonly tags: Tag[];
  readonly deletedTags: DeletedTag[];
} {
  const tags: Tag[] = [];
  const deletedTags: DeletedTag[] = [];

  for (const tagId of collectTagIds(localVault, remoteVault)) {
    const state =
      resolvedStateById.get(tagId) ?? getTagState(localVault, tagId);

    if (state.state === "tag") {
      tags.push(state.tag);
    }

    if (state.state === "deleted") {
      deletedTags.push(state.deletedTag);
    }
  }

  return {
    tags,
    deletedTags,
  };
}

function createTagResolutionMap(
  tagResolutions: readonly TagReviewResolution[],
): Map<number, TagReviewResolution> {
  const resolutionById = new Map<number, TagReviewResolution>();

  for (const tagResolution of tagResolutions) {
    assertSupportedAction(tagResolution.action);

    if (resolutionById.has(tagResolution.tagId)) {
      throw new InvalidVaultSyncResolutionError(
        `Tag "${tagResolution.tagId}" has multiple sync resolutions.`,
      );
    }

    resolutionById.set(tagResolution.tagId, tagResolution);
  }

  return resolutionById;
}

function selectTagState(
  tagReview: TagReviewItem,
  tagResolution: TagReviewResolution,
): ReviewableTag {
  return tagResolution.action === "use_local"
    ? tagReview.localTag
    : tagReview.remoteTag;
}

function stampTagState(
  selectedState: ReviewableTag,
  localState: ReviewableTag,
  remoteState: ReviewableTag,
  deviceId: string,
): ReviewableTag {
  if (selectedState.state === "missing") {
    return selectedState;
  }

  const versionVector = stampResolvedVersionVector(
    getTagVersionVector(localState),
    getTagVersionVector(remoteState),
    deviceId,
  );

  if (selectedState.state === "tag") {
    return {
      state: "tag",
      tag: {
        ...selectedState.tag,
        versionVector,
      },
    };
  }

  return {
    state: "deleted",
    deletedTag: {
      ...selectedState.deletedTag,
      versionVector,
    },
  };
}

function getTagVersionVector(state: ReviewableTag): VersionVector | null {
  if (state.state === "missing") {
    return null;
  }

  if (state.state === "tag") {
    return state.tag.versionVector;
  }

  return state.deletedTag.versionVector;
}

function collectTagIds(localVault: Vault, remoteVault: Vault): Set<number> {
  return new Set([
    ...localVault.tags.map((tag) => tag.id),
    ...remoteVault.tags.map((tag) => tag.id),
    ...localVault.deletedTags.map((deletedTag) => deletedTag.id),
    ...remoteVault.deletedTags.map((deletedTag) => deletedTag.id),
  ]);
}

function getTagState(vault: Vault, tagId: number): ReviewableTag {
  const tag = vault.tags.find((vaultTag) => vaultTag.id === tagId);
  const deletedTag = vault.deletedTags.find(
    (vaultDeletedTag) => vaultDeletedTag.id === tagId,
  );

  if (tag !== undefined && deletedTag !== undefined) {
    throw new InvalidVaultSyncResolutionError(
      `Tag "${tagId}" exists as both active and deleted in the same vault.`,
    );
  }

  if (tag !== undefined) {
    return {
      state: "tag",
      tag,
    };
  }

  if (deletedTag !== undefined) {
    return {
      state: "deleted",
      deletedTag,
    };
  }

  return {
    state: "missing",
  };
}

function assertSupportedAction(action: VaultSyncReviewAction): void {
  if (action === "use_local" || action === "use_remote") {
    return;
  }

  throw new InvalidVaultSyncResolutionError(
    "Unsupported sync resolution action.",
  );
}

function stampResolvedVersionVector(
  localVersionVector: VersionVector | null,
  remoteVersionVector: VersionVector | null,
  deviceId: string,
): VersionVector {
  return incrementVersionVector(
    mergeVersionVectors(localVersionVector ?? {}, remoteVersionVector ?? {}),
    deviceId,
  );
}
