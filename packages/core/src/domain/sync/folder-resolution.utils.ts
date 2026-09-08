import { InvalidVaultSyncResolutionError } from "../../errors/sync.errors";
import type { DeletedFolder, Folder } from "../organization/folder.type";
import type { Vault } from "../vault/vault";
import type { VersionVector } from "../versioning/version-vector.type";
import {
  incrementVersionVector,
  mergeVersionVectors,
} from "../versioning/version-vector.utils";
import type { ReviewableFolder, FolderReviewItem } from "./folder-review.type";
import type { FolderReviewResolution } from "./folder-resolution.type";
import type { VaultSyncReviewAction } from "./vault-sync-item-review.type";

export function resolveFolderStates(
  folderReviews: readonly FolderReviewItem[],
  folderResolutions: readonly FolderReviewResolution[],
  deviceId: string,
): Map<string, ReviewableFolder> {
  const resolutionById = createFolderResolutionMap(folderResolutions);
  const resolvedStateById = new Map<string, ReviewableFolder>();

  for (const folderResolution of folderResolutions) {
    if (
      !folderReviews.some(
        (folderReview) => folderReview.folderId === folderResolution.folderId,
      )
    ) {
      throw new InvalidVaultSyncResolutionError(
        `Folder "${folderResolution.folderId}" does not require sync resolution.`,
      );
    }
  }

  for (const folderReview of folderReviews) {
    const folderResolution = resolutionById.get(folderReview.folderId);

    if (folderResolution === undefined) {
      throw new InvalidVaultSyncResolutionError(
        `Folder "${folderReview.folderId}" must have a sync resolution.`,
      );
    }

    resolvedStateById.set(
      folderReview.folderId,
      stampFolderState(
        selectFolderState(folderReview, folderResolution),
        folderReview.localFolder,
        folderReview.remoteFolder,
        deviceId,
      ),
    );
  }

  return resolvedStateById;
}

export function buildResolvedVaultFolders(
  localVault: Vault,
  remoteVault: Vault,
  resolvedStateById: ReadonlyMap<string, ReviewableFolder>,
): {
  readonly folders: Folder[];
  readonly deletedFolders: DeletedFolder[];
} {
  const folders: Folder[] = [];
  const deletedFolders: DeletedFolder[] = [];

  for (const folderId of collectFolderIds(localVault, remoteVault)) {
    const state =
      resolvedStateById.get(folderId) ?? getFolderState(localVault, folderId);

    if (state.state === "folder") {
      folders.push(state.folder);
    }

    if (state.state === "deleted") {
      deletedFolders.push(state.deletedFolder);
    }
  }

  return {
    folders,
    deletedFolders,
  };
}

function createFolderResolutionMap(
  folderResolutions: readonly FolderReviewResolution[],
): Map<string, FolderReviewResolution> {
  const resolutionById = new Map<string, FolderReviewResolution>();

  for (const folderResolution of folderResolutions) {
    assertSupportedAction(folderResolution.action);

    if (resolutionById.has(folderResolution.folderId)) {
      throw new InvalidVaultSyncResolutionError(
        `Folder "${folderResolution.folderId}" has multiple sync resolutions.`,
      );
    }

    resolutionById.set(folderResolution.folderId, folderResolution);
  }

  return resolutionById;
}

function selectFolderState(
  folderReview: FolderReviewItem,
  folderResolution: FolderReviewResolution,
): ReviewableFolder {
  if (
    folderReview.relation === "remote_only" &&
    folderResolution.action === "use_local"
  ) {
    throw new InvalidVaultSyncResolutionError(
      `Folder "${folderReview.folderId}" cannot use local absence to resolve remote-only state.`,
    );
  }

  return folderResolution.action === "use_local"
    ? folderReview.localFolder
    : folderReview.remoteFolder;
}

function stampFolderState(
  selectedState: ReviewableFolder,
  localState: ReviewableFolder,
  remoteState: ReviewableFolder,
  deviceId: string,
): ReviewableFolder {
  if (selectedState.state === "missing") {
    return selectedState;
  }

  const versionVector = stampResolvedVersionVector(
    getFolderVersionVector(localState),
    getFolderVersionVector(remoteState),
    deviceId,
  );

  if (selectedState.state === "folder") {
    return {
      state: "folder",
      folder: {
        ...selectedState.folder,
        versionVector,
      },
    };
  }

  return {
    state: "deleted",
    deletedFolder: {
      ...selectedState.deletedFolder,
      versionVector,
    },
  };
}

function getFolderVersionVector(state: ReviewableFolder): VersionVector | null {
  if (state.state === "missing") {
    return null;
  }

  if (state.state === "folder") {
    return state.folder.versionVector;
  }

  return state.deletedFolder.versionVector;
}

function collectFolderIds(localVault: Vault, remoteVault: Vault): Set<string> {
  return new Set([
    ...localVault.folders.map((folder) => folder.id),
    ...remoteVault.folders.map((folder) => folder.id),
    ...localVault.deletedFolders.map((deletedFolder) => deletedFolder.id),
    ...remoteVault.deletedFolders.map((deletedFolder) => deletedFolder.id),
  ]);
}

function getFolderState(vault: Vault, folderId: string): ReviewableFolder {
  const folder = vault.folders.find(
    (vaultFolder) => vaultFolder.id === folderId,
  );
  const deletedFolder = vault.deletedFolders.find(
    (vaultDeletedFolder) => vaultDeletedFolder.id === folderId,
  );

  if (folder !== undefined && deletedFolder !== undefined) {
    throw new InvalidVaultSyncResolutionError(
      `Folder "${folderId}" exists as both active and deleted in the same vault.`,
    );
  }

  if (folder !== undefined) {
    return {
      state: "folder",
      folder,
    };
  }

  if (deletedFolder !== undefined) {
    return {
      state: "deleted",
      deletedFolder,
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
