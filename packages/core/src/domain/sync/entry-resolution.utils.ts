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
import type { EntryReviewItem } from "./entry-review.type";
import type { EntryReviewResolution } from "./entry-resolution.type";
import type { VaultSyncReviewAction } from "./vault-sync-item-review.type";

export function resolveEntryStates(
  localVault: Vault,
  remoteVault: Vault,
  entryReviews: readonly EntryReviewItem[],
  entryResolutions: readonly EntryReviewResolution[],
  deviceId: string,
): Map<string, ResolvableEntryState> {
  const resolutionById = createEntryResolutionMap(entryResolutions);
  const resolvedStateById = new Map<string, ResolvableEntryState>();

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

    const localState = getEntryState(localVault, entryReview.entryId);
    const remoteState = getEntryState(remoteVault, entryReview.entryId);

    resolvedStateById.set(
      entryReview.entryId,
      stampEntryState(
        selectEntryState(entryReview, entryResolution, localState, remoteState),
        localState,
        remoteState,
        deviceId,
      ),
    );
  }

  return resolvedStateById;
}

export function buildResolvedVaultEntries(
  localVault: Vault,
  remoteVault: Vault,
  resolvedStateById: ReadonlyMap<string, ResolvableEntryState>,
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
  localState: ResolvableEntryState,
  remoteState: ResolvableEntryState,
): ResolvableEntryState {
  if (
    entryReview.relation === "remote_only" &&
    entryResolution.action === "use_local"
  ) {
    throw new InvalidVaultSyncResolutionError(
      `Entry "${entryReview.entryId}" cannot use local absence to resolve remote-only state.`,
    );
  }

  return entryResolution.action === "use_local" ? localState : remoteState;
}

function stampEntryState(
  selectedState: ResolvableEntryState,
  localState: ResolvableEntryState,
  remoteState: ResolvableEntryState,
  deviceId: string,
): ResolvableEntryState {
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

function getEntryVersionVector(
  state: ResolvableEntryState,
): VersionVector | null {
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

function getEntryState(vault: Vault, entryId: string): ResolvableEntryState {
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

type ResolvableEntryState =
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
