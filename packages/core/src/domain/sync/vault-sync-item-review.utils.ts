import { areJsonEqual } from "../common/json.utils";
import type { VersionVector } from "./version-vector.type";
import {
  compareVersionVectors,
  incrementVersionVector,
  mergeVersionVectors,
} from "./version-vector.utils";
import type {
  VaultSyncItemRelation,
  VaultSyncReviewAction,
} from "./vault-sync-item-review.type";

export function getSyncItemRelation(
  localVersionVector: VersionVector | null,
  remoteVersionVector: VersionVector | null,
): VaultSyncItemRelation {
  if (localVersionVector === null) {
    return "remote_only";
  }

  if (remoteVersionVector === null) {
    return "local_only";
  }

  return compareVersionVectors(localVersionVector, remoteVersionVector);
}

export function hasSyncItemConflict(
  relation: VaultSyncItemRelation,
  localState: unknown,
  remoteState: unknown,
): boolean {
  return (
    relation === "diverged" ||
    (relation === "equal" && !areJsonEqual(localState, remoteState))
  );
}

export function getPreselectedSyncAction(
  relation: VaultSyncItemRelation,
): VaultSyncReviewAction {
  return relation === "remote_ahead" || relation === "remote_only"
    ? "use_remote"
    : "use_local";
}

export function stampResolvedVersionVector(
  localVersionVector: VersionVector | null,
  remoteVersionVector: VersionVector | null,
  deviceId: string,
): VersionVector {
  return incrementVersionVector(
    mergeVersionVectors(localVersionVector ?? {}, remoteVersionVector ?? {}),
    deviceId,
  );
}
