import { InvalidVaultSyncReviewError } from "../../errors";
import { areJsonEqual } from "../common";
import { toVisiblePasswordEntryFields } from "../entry/password-entry.mapper";
import type {
  DeletedPasswordEntry,
  PasswordEntry,
} from "../entry/password-entry.type";
import type { Vault } from "../vault";
import type { EntryReviewItem, ReviewableEntry } from "./entry-review.type";
import type { VaultSyncItemRelation } from "./vault-sync-item-review.type";

type StoredEntryState =
  | {
      readonly entry: PasswordEntry;
      readonly state: "entry";
    }
  | {
      readonly deletedEntry: DeletedPasswordEntry;
      readonly state: "deleted";
    }
  | {
      readonly state: "missing";
    };

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
      localEntry: toReviewableEntry(localEntry),
      remoteEntry: toReviewableEntry(remoteEntry),
      passwordChanged: havePasswordsChanged(localEntry, remoteEntry),
    });
  }

  return entryReviews;
}

function findEntry(vault: Vault, entryId: string): StoredEntryState {
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
  localEntry: StoredEntryState,
  remoteEntry: StoredEntryState,
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

function toReviewableEntry(entryState: StoredEntryState): ReviewableEntry {
  if (entryState.state === "entry") {
    return {
      state: "entry",
      entry: toVisiblePasswordEntryFields(entryState.entry),
    };
  }

  if (entryState.state === "deleted") {
    return {
      state: "deleted",
      deletedEntry: {
        id: entryState.deletedEntry.id,
        deletedAt: entryState.deletedEntry.deletedAt,
      },
    };
  }

  return { state: "missing" };
}

function havePasswordsChanged(
  localEntry: StoredEntryState,
  remoteEntry: StoredEntryState,
): boolean {
  return (
    localEntry.state === "entry" &&
    remoteEntry.state === "entry" &&
    localEntry.entry.password !== remoteEntry.entry.password
  );
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
