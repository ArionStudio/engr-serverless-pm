import { areJsonEqual } from "../common/json.utils";
import type { DeletedTag, Tag } from "../entry/tag.type";
import type { Vault } from "../vault/vault";
import { InvalidVaultSyncResolutionError } from "../../errors/sync.errors";
import type { VersionVector } from "./version-vector.type";
import {
  getPreselectedSyncAction,
  getSyncItemRelation,
  hasSyncItemConflict,
  stampResolvedVersionVector,
} from "./vault-sync-item-review.utils";
import type {
  VaultSyncTagResolution,
  VaultSyncTagReview,
  VaultSyncTagState,
} from "./vault-sync-tag-review.type";

export function createTagReviews(
  localVault: Vault,
  remoteVault: Vault,
): VaultSyncTagReview[] {
  const tagReviews: VaultSyncTagReview[] = [];

  for (const tagId of collectTagIds(localVault, remoteVault)) {
    const localState = getTagState(localVault, tagId);
    const remoteState = getTagState(remoteVault, tagId);

    if (areJsonEqual(localState, remoteState)) {
      continue;
    }

    tagReviews.push(createTagReview(tagId, localState, remoteState));
  }

  return tagReviews;
}

export function resolveTagStates(
  tagReviews: readonly VaultSyncTagReview[],
  tagResolutions: readonly VaultSyncTagResolution[],
  deviceId: string,
): Map<number, VaultSyncTagState> {
  const resolutionById = new Map<number, VaultSyncTagResolution>();

  for (const tagResolution of tagResolutions) {
    if (resolutionById.has(tagResolution.tagId)) {
      throw new InvalidVaultSyncResolutionError(
        `Tag "${tagResolution.tagId}" has multiple sync resolutions.`,
      );
    }

    resolutionById.set(tagResolution.tagId, tagResolution);
  }

  for (const tagResolution of tagResolutions) {
    if (
      !tagReviews.some((tagReview) => tagReview.tagId === tagResolution.tagId)
    ) {
      throw new InvalidVaultSyncResolutionError(
        `Tag "${tagResolution.tagId}" does not require sync resolution.`,
      );
    }
  }

  const resolvedStateById = new Map<number, VaultSyncTagState>();

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
        tagReview.localState,
        tagReview.remoteState,
        deviceId,
      ),
    );
  }

  return resolvedStateById;
}

export function buildResolvedVaultTags(
  localVault: Vault,
  remoteVault: Vault,
  resolvedStateById: ReadonlyMap<number, VaultSyncTagState>,
): {
  readonly tags: Tag[];
  readonly deletedTags: DeletedTag[];
} {
  const tags: Tag[] = [];
  const deletedTags: DeletedTag[] = [];

  for (const tagId of collectTagIds(localVault, remoteVault)) {
    const state =
      resolvedStateById.get(tagId) ?? getTagState(localVault, tagId);

    if (state.kind === "tag") {
      tags.push(state.tag);
    }

    if (state.kind === "deleted") {
      deletedTags.push(state.deletedTag);
    }
  }

  return {
    tags,
    deletedTags,
  };
}

function createTagReview(
  tagId: number,
  localState: VaultSyncTagState,
  remoteState: VaultSyncTagState,
): VaultSyncTagReview {
  const relation = getSyncItemRelation(
    getOptionalTagStateVersionVector(localState),
    getOptionalTagStateVersionVector(remoteState),
  );

  return {
    kind: "tag",
    tagId,
    relation,
    conflict: hasSyncItemConflict(relation, localState, remoteState),
    preselectedAction: getPreselectedSyncAction(relation),
    localState,
    remoteState,
  };
}

function collectTagIds(localVault: Vault, remoteVault: Vault): Set<number> {
  return new Set([
    ...localVault.tags.map((tag) => tag.id),
    ...remoteVault.tags.map((tag) => tag.id),
    ...localVault.deletedTags.map((deletedTag) => deletedTag.id),
    ...remoteVault.deletedTags.map((deletedTag) => deletedTag.id),
  ]);
}

function getTagState(vault: Vault, tagId: number): VaultSyncTagState {
  const tag = vault.tags.find((vaultTag) => vaultTag.id === tagId);

  if (tag !== undefined) {
    return {
      kind: "tag",
      tag,
    };
  }

  const deletedTag = vault.deletedTags.find(
    (vaultDeletedTag) => vaultDeletedTag.id === tagId,
  );

  if (deletedTag !== undefined) {
    return {
      kind: "deleted",
      deletedTag,
    };
  }

  return {
    kind: "missing",
  };
}

function selectTagState(
  tagReview: VaultSyncTagReview,
  tagResolution: VaultSyncTagResolution,
): VaultSyncTagState {
  if (tagResolution.action === "use_local") {
    return tagReview.localState;
  }

  if (tagResolution.action === "use_remote") {
    return tagReview.remoteState;
  }

  if (tagResolution.action === "use_resolved") {
    return tagResolution.state;
  }

  throw new InvalidVaultSyncResolutionError(
    `Unsupported tag resolution action.`,
  );
}

function stampTagState(
  selectedState: VaultSyncTagState,
  localState: VaultSyncTagState,
  remoteState: VaultSyncTagState,
  deviceId: string,
): VaultSyncTagState {
  if (selectedState.kind === "missing") {
    return selectedState;
  }

  const versionVector = stampResolvedVersionVector(
    getOptionalTagStateVersionVector(localState),
    getOptionalTagStateVersionVector(remoteState),
    deviceId,
  );

  if (selectedState.kind === "tag") {
    return {
      kind: "tag",
      tag: {
        ...selectedState.tag,
        versionVector,
      },
    };
  }

  return {
    kind: "deleted",
    deletedTag: {
      ...selectedState.deletedTag,
      versionVector,
    },
  };
}

function getOptionalTagStateVersionVector(
  state: VaultSyncTagState,
): VersionVector | null {
  if (state.kind === "missing") {
    return null;
  }

  if (state.kind === "tag") {
    return state.tag.versionVector;
  }

  return state.deletedTag.versionVector;
}
