import { InvalidVaultSyncReviewError } from "../../errors";
import { areJsonEqual } from "../common";
import type { Vault } from "../vault";
import type { EntryReviewItem, ReviewableEntry } from "./entry-review.type";
import type { VaultSyncItemRelation } from "./vault-sync-item-review.type";

export function findChangedEntries(
  localVault: Vault,
  remoteVault: Vault,
): EntryReviewItem[] {
  const entryReviews: EntryReviewItem[] = [];

  for (const entryId of findAllEntriesIds(localVault, remoteVault)) {
    const localEntry = findEntry(localVault, entryId);
    const remoteEntry = findEntry(remoteVault, entryId);

    const relation = getEntryRelation(localEntry, remoteEntry);

    if (relation === "broken") {
      throw new InvalidVaultSyncReviewError(
        `Entry "${entryId}" has an invalid local/remote sync relation.`,
      );
    }

    if (relation === "equal") {
      continue;
    }

    entryReviews.push({
      entryId,
      relation,
      preselectedAction: "use_remote",
      localEntry,
      remoteEntry,
    });
  }

  return entryReviews;
}

function findEntry(vault: Vault, entryId: string): ReviewableEntry {
  const entry = vault.entries.find((entry) => entry.id === entryId);
  const deletedEntry = vault.deletedEntries.find(
    (deletedEntry) => deletedEntry.id === entryId,
  );

  if (entry !== undefined && deletedEntry !== undefined) {
    throw new InvalidVaultSyncReviewError(
      `Entry "${entryId}" exists as both active and deleted in the same vault.`,
    );
  }

  if (entry !== undefined) {
    return {
      entry,
      state: "entry",
    };
  }

  if (deletedEntry !== undefined) {
    return {
      deletedEntry,
      state: "deleted",
    };
  }

  return {
    state: "missing",
  };
}

function getEntryRelation(
  localEntry: ReviewableEntry,
  remoteEntry: ReviewableEntry,
): VaultSyncItemRelation {
  if (areJsonEqual(localEntry, remoteEntry)) {
    return "equal";
  }

  if (localEntry.state === "missing" && remoteEntry.state === "missing") {
    return "broken";
  }

  if (localEntry.state === "missing") {
    return "remote_only";
  }

  if (remoteEntry.state === "missing") {
    return "broken";
  }

  const localVersionVector =
    localEntry.state === "entry"
      ? localEntry.entry.versionVector
      : localEntry.deletedEntry.versionVector;
  const remoteVersionVector =
    remoteEntry.state === "entry"
      ? remoteEntry.entry.versionVector
      : remoteEntry.deletedEntry.versionVector;

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

export function findAllEntriesIds(
  localVault: Vault,
  remoteVault: Vault,
): Set<string> {
  return new Set([
    ...localVault.entries.map((entry) => entry.id),
    ...remoteVault.entries.map((entry) => entry.id),
    ...localVault.deletedEntries.map((deletedEntry) => deletedEntry.id),
    ...remoteVault.deletedEntries.map((deletedEntry) => deletedEntry.id),
  ]);
}
