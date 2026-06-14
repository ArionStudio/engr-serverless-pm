import type {
  VersionVector,
  VersionVectorRelation,
} from "./version-vector.type";

export function incrementVersionVector(
  versionVector: VersionVector,
  deviceId: string,
): VersionVector {
  return {
    ...versionVector,
    [deviceId]: (versionVector[deviceId] ?? 0) + 1,
  };
}

export function mergeVersionVectors(
  local: VersionVector,
  remote: VersionVector,
): VersionVector {
  const deviceIds = new Set([...Object.keys(local), ...Object.keys(remote)]);
  const mergedVersionVector: VersionVector = {};

  for (const deviceId of deviceIds) {
    mergedVersionVector[deviceId] = Math.max(
      local[deviceId] ?? 0,
      remote[deviceId] ?? 0,
    );
  }

  return mergedVersionVector;
}

export function isVersionVectorAheadOf(
  candidate: VersionVector,
  baseline: VersionVector,
): boolean {
  for (const deviceId of Object.keys(candidate)) {
    if ((candidate[deviceId] ?? 0) > (baseline[deviceId] ?? 0)) {
      return true;
    }
  }

  return false;
}

export function compareVersionVectors(
  local: VersionVector,
  remote: VersionVector,
): Exclude<VersionVectorRelation, "remote_missing"> {
  let localHasNewerComponent = false;
  let remoteHasNewerComponent = false;
  const deviceIds = new Set([...Object.keys(local), ...Object.keys(remote)]);

  for (const deviceId of deviceIds) {
    const localValue = local[deviceId] ?? 0;
    const remoteValue = remote[deviceId] ?? 0;

    if (localValue > remoteValue) {
      localHasNewerComponent = true;
    }

    if (remoteValue > localValue) {
      remoteHasNewerComponent = true;
    }
  }

  if (localHasNewerComponent && remoteHasNewerComponent) {
    return "broken";
  }

  if (localHasNewerComponent) {
    return "local_ahead";
  }

  if (remoteHasNewerComponent) {
    return "remote_ahead";
  }

  return "equal";
}
