import type {
  DeletedPasswordEntry,
  PasswordEntry,
} from "../entry/password-entry.type";
import type { Vault } from "../vault/vault";
import type { VersionVector } from "./version-vector.type";
import {
  getPreselectedSyncAction,
  getSyncItemRelation,
  hasSyncItemConflict,
  stampResolvedVersionVector,
} from "./vault-sync-item-review.utils";
import type {
  VaultSyncEntryResolution,
  VaultSyncEntryReview,
  VaultSyncEntryState,
} from "./vault-sync-entry-review.type";
import { areJsonEqual } from "../common/json.utils";

export type ResolvedVaultEntries = {
  readonly entries: PasswordEntry[];
  readonly deletedEntries: DeletedPasswordEntry[];
};

export function createEntryReviews(
  localVault: Vault,
  remoteVault: Vault,
): VaultSyncEntryReview[] {
  const entryReviews: VaultSyncEntryReview[] = [];

  for (const entryId of collectEntryIds(localVault, remoteVault)) {
    const localState = getEntryState(localVault, entryId);
    const remoteState = getEntryState(remoteVault, entryId);

    if (areJsonEqual(localState, remoteState)) {
      continue;
    }

    entryReviews.push(createEntryReview(entryId, localState, remoteState));
  }

  return entryReviews;
}

export function resolveEntryStates(
  entryReviews: readonly VaultSyncEntryReview[],
  entryResolutions: readonly VaultSyncEntryResolution[],
  deviceId: string,
): Map<string, VaultSyncEntryState> {
  const resolutionById = new Map(
    entryResolutions.map((entryResolution) => [
      entryResolution.entryId,
      entryResolution,
    ]),
  );

  for (const entryResolution of entryResolutions) {
    if (
      !entryReviews.some(
        (entryReview) => entryReview.entryId === entryResolution.entryId,
      )
    ) {
      throw new Error(
        `Entry "${entryResolution.entryId}" does not require sync resolution.`,
      );
    }
  }

  const resolvedStateById = new Map<string, VaultSyncEntryState>();

  for (const entryReview of entryReviews) {
    const entryResolution = resolutionById.get(entryReview.entryId);

    if (entryResolution === undefined) {
      throw new Error(
        `Entry "${entryReview.entryId}" must have a sync resolution.`,
      );
    }

    resolvedStateById.set(
      entryReview.entryId,
      stampEntryState(
        selectEntryState(entryReview, entryResolution),
        entryReview.localState,
        entryReview.remoteState,
        deviceId,
      ),
    );
  }

  return resolvedStateById;
}

export function buildResolvedVaultEntries(
  localVault: Vault,
  remoteVault: Vault,
  resolvedStateById: ReadonlyMap<string, VaultSyncEntryState>,
): ResolvedVaultEntries {
  const entries: PasswordEntry[] = [];
  const deletedEntries: DeletedPasswordEntry[] = [];

  for (const entryId of collectEntryIds(localVault, remoteVault)) {
    const state =
      resolvedStateById.get(entryId) ?? getEntryState(localVault, entryId);

    if (state.kind === "entry") {
      entries.push(state.entry);
    }

    if (state.kind === "deleted") {
      deletedEntries.push(state.deletedEntry);
    }
  }

  return {
    entries,
    deletedEntries,
  };
}

function createEntryReview(
  entryId: string,
  localState: VaultSyncEntryState,
  remoteState: VaultSyncEntryState,
): VaultSyncEntryReview {
  const relation = getSyncItemRelation(
    getOptionalEntryStateVersionVector(localState),
    getOptionalEntryStateVersionVector(remoteState),
  );

  return {
    kind: "password_entry",
    entryId,
    relation,
    conflict: hasSyncItemConflict(relation, localState, remoteState),
    preselectedAction: getPreselectedSyncAction(relation),
    localState,
    remoteState,
  };
}

function collectEntryIds(localVault: Vault, remoteVault: Vault): Set<string> {
  return new Set([
    ...localVault.entries.map((entry) => entry.id),
    ...remoteVault.entries.map((entry) => entry.id),
    ...localVault.deletedEntries.map((deletedEntry) => deletedEntry.id),
    ...remoteVault.deletedEntries.map((deletedEntry) => deletedEntry.id),
  ]);
}

function getEntryState(vault: Vault, entryId: string): VaultSyncEntryState {
  const entry = vault.entries.find((vaultEntry) => vaultEntry.id === entryId);

  if (entry !== undefined) {
    return {
      kind: "entry",
      entry,
    };
  }

  const deletedEntry = vault.deletedEntries.find(
    (vaultDeletedEntry) => vaultDeletedEntry.id === entryId,
  );

  if (deletedEntry !== undefined) {
    return {
      kind: "deleted",
      deletedEntry,
    };
  }

  return {
    kind: "missing",
  };
}

function selectEntryState(
  entryReview: VaultSyncEntryReview,
  entryResolution: VaultSyncEntryResolution,
): VaultSyncEntryState {
  if (entryResolution.action === "use_local") {
    return entryReview.localState;
  }

  if (entryResolution.action === "use_remote") {
    return entryReview.remoteState;
  }

  if (entryResolution.action === "use_resolved") {
    return entryResolution.state;
  }

  throw new Error(`Unsupported entry resolution action.`);
}

function stampEntryState(
  selectedState: VaultSyncEntryState,
  localState: VaultSyncEntryState,
  remoteState: VaultSyncEntryState,
  deviceId: string,
): VaultSyncEntryState {
  if (selectedState.kind === "missing") {
    return selectedState;
  }

  const versionVector = stampResolvedVersionVector(
    getOptionalEntryStateVersionVector(localState),
    getOptionalEntryStateVersionVector(remoteState),
    deviceId,
  );

  if (selectedState.kind === "entry") {
    return {
      kind: "entry",
      entry: {
        ...selectedState.entry,
        versionVector,
      },
    };
  }

  return {
    kind: "deleted",
    deletedEntry: {
      ...selectedState.deletedEntry,
      versionVector,
    },
  };
}

function getOptionalEntryStateVersionVector(
  state: VaultSyncEntryState,
): VersionVector | null {
  if (state.kind === "missing") {
    return null;
  }

  if (state.kind === "entry") {
    return state.entry.versionVector;
  }

  return state.deletedEntry.versionVector;
}
