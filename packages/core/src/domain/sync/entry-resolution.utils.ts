import { InvalidVaultSyncResolutionError } from "../../errors/sync.errors";
import type {
  DeletedPasswordEntry,
  PasswordEntry,
} from "../entry/password-entry.type";
import type { Vault } from "../vault/vault";
import type { VersionVector } from "../versioning/version-vector.type";
import {
  incrementVersionVector,
  mergeVersionVectors,
} from "../versioning/version-vector.utils";
import type { EntryReviewItem, ReviewableEntry } from "./entry-review.type";
import type { EntryReviewResolution } from "./entry-resolution.type";
import type { VaultSyncReviewAction } from "./vault-sync-item-review.type";

export function resolveEntryStates(
  entryReviews: readonly EntryReviewItem[],
  entryResolutions: readonly EntryReviewResolution[],
  deviceId: string,
): Map<string, ReviewableEntry> {
  const resolutionById = createEntryResolutionMap(entryResolutions);
  const resolvedStateById = new Map<string, ReviewableEntry>();

  for (const entryResolution of entryResolutions) {
    if (
      !entryReviews.some(
        (entryReview) => entryReview.entryId === entryResolution.entryId,
      )
    ) {
      throw new InvalidVaultSyncResolutionError(
        `Entry "${entryResolution.entryId}" does not require sync resolution.`,
      );
    }
  }

  for (const entryReview of entryReviews) {
    const entryResolution = resolutionById.get(entryReview.entryId);

    if (entryResolution === undefined) {
      throw new InvalidVaultSyncResolutionError(
        `Entry "${entryReview.entryId}" must have a sync resolution.`,
      );
    }

    resolvedStateById.set(
      entryReview.entryId,
      stampEntryState(
        selectEntryState(entryReview, entryResolution),
        entryReview.localEntry,
        entryReview.remoteEntry,
        deviceId,
      ),
    );
  }

  return resolvedStateById;
}

export function buildResolvedVaultEntries(
  localVault: Vault,
  remoteVault: Vault,
  resolvedStateById: ReadonlyMap<string, ReviewableEntry>,
): {
  readonly entries: PasswordEntry[];
  readonly deletedEntries: DeletedPasswordEntry[];
} {
  const entries: PasswordEntry[] = [];
  const deletedEntries: DeletedPasswordEntry[] = [];

  for (const entryId of collectEntryIds(localVault, remoteVault)) {
    const state =
      resolvedStateById.get(entryId) ?? getEntryState(localVault, entryId);

    if (state.state === "entry") {
      entries.push(state.entry);
    }

    if (state.state === "deleted") {
      deletedEntries.push(state.deletedEntry);
    }
  }

  return {
    entries,
    deletedEntries,
  };
}

function createEntryResolutionMap(
  entryResolutions: readonly EntryReviewResolution[],
): Map<string, EntryReviewResolution> {
  const resolutionById = new Map<string, EntryReviewResolution>();

  for (const entryResolution of entryResolutions) {
    assertSupportedAction(entryResolution.action);

    if (resolutionById.has(entryResolution.entryId)) {
      throw new InvalidVaultSyncResolutionError(
        `Entry "${entryResolution.entryId}" has multiple sync resolutions.`,
      );
    }

    resolutionById.set(entryResolution.entryId, entryResolution);
  }

  return resolutionById;
}

function selectEntryState(
  entryReview: EntryReviewItem,
  entryResolution: EntryReviewResolution,
): ReviewableEntry {
  return entryResolution.action === "use_local"
    ? entryReview.localEntry
    : entryReview.remoteEntry;
}

function stampEntryState(
  selectedState: ReviewableEntry,
  localState: ReviewableEntry,
  remoteState: ReviewableEntry,
  deviceId: string,
): ReviewableEntry {
  if (selectedState.state === "missing") {
    return selectedState;
  }

  const versionVector = stampResolvedVersionVector(
    getEntryVersionVector(localState),
    getEntryVersionVector(remoteState),
    deviceId,
  );

  if (selectedState.state === "entry") {
    return {
      state: "entry",
      entry: {
        ...selectedState.entry,
        versionVector,
      },
    };
  }

  return {
    state: "deleted",
    deletedEntry: {
      ...selectedState.deletedEntry,
      versionVector,
    },
  };
}

function getEntryVersionVector(state: ReviewableEntry): VersionVector | null {
  if (state.state === "missing") {
    return null;
  }

  if (state.state === "entry") {
    return state.entry.versionVector;
  }

  return state.deletedEntry.versionVector;
}

function collectEntryIds(localVault: Vault, remoteVault: Vault): Set<string> {
  return new Set([
    ...localVault.entries.map((entry) => entry.id),
    ...remoteVault.entries.map((entry) => entry.id),
    ...localVault.deletedEntries.map((deletedEntry) => deletedEntry.id),
    ...remoteVault.deletedEntries.map((deletedEntry) => deletedEntry.id),
  ]);
}

function getEntryState(vault: Vault, entryId: string): ReviewableEntry {
  const entry = vault.entries.find((vaultEntry) => vaultEntry.id === entryId);
  const deletedEntry = vault.deletedEntries.find(
    (vaultDeletedEntry) => vaultDeletedEntry.id === entryId,
  );

  if (entry !== undefined && deletedEntry !== undefined) {
    throw new InvalidVaultSyncResolutionError(
      `Entry "${entryId}" exists as both active and deleted in the same vault.`,
    );
  }

  if (entry !== undefined) {
    return {
      state: "entry",
      entry,
    };
  }

  if (deletedEntry !== undefined) {
    return {
      state: "deleted",
      deletedEntry,
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
