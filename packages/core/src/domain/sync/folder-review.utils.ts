import { InvalidVaultSyncReviewError } from "../../errors";
import { areJsonEqual } from "../common";
import type { Vault } from "../vault";
import type { ReviewableFolder, FolderReviewItem } from "./folder-review.type";
import type { VaultSyncItemRelation } from "./vault-sync-item-review.type";

export function findChangedFolders(
  localVault: Vault,
  remoteVault: Vault,
): FolderReviewItem[] {
  if (!areJsonEqual(localVault.tagGroups, remoteVault.tagGroups)) {
    throw new InvalidVaultSyncReviewError(
      "Local and remote tag-group definitions do not match.",
    );
  }
  const folderReviews: FolderReviewItem[] = [];

  for (const folderId of findAllFoldersIds(localVault, remoteVault)) {
    const localFolder = findFolder(localVault, folderId);
    const remoteFolder = findFolder(remoteVault, folderId);
    const relation = getFolderRelation(localFolder, remoteFolder);

    if (relation === "broken") {
      throw new InvalidVaultSyncReviewError(
        `Folder "${folderId}" has an invalid local/remote sync relation.`,
      );
    }

    if (relation === "equal") {
      continue;
    }

    folderReviews.push({
      folderId,
      relation,
      preselectedAction: "use_remote",
      localFolder,
      remoteFolder,
    });
  }

  return folderReviews;
}

function findFolder(vault: Vault, folderId: string): ReviewableFolder {
  const folder = vault.folders.find((folder) => folder.id === folderId);
  const deletedFolder = vault.deletedFolders.find(
    (deletedFolder) => deletedFolder.id === folderId,
  );

  if (folder !== undefined && deletedFolder !== undefined) {
    throw new InvalidVaultSyncReviewError(
      `Folder "${folderId}" exists as both active and deleted in the same vault.`,
    );
  }

  if (folder !== undefined) {
    return {
      folder,
      state: "folder",
    };
  }

  if (deletedFolder !== undefined) {
    return {
      deletedFolder,
      state: "deleted",
    };
  }

  return {
    state: "missing",
  };
}

function getFolderRelation(
  localFolder: ReviewableFolder,
  remoteFolder: ReviewableFolder,
): VaultSyncItemRelation {
  if (areJsonEqual(localFolder, remoteFolder)) {
    return "equal";
  }

  if (localFolder.state === "missing" && remoteFolder.state === "missing") {
    return "broken";
  }

  if (localFolder.state === "missing") {
    return "remote_only";
  }

  if (remoteFolder.state === "missing") {
    return "broken";
  }

  const localVersionVector =
    localFolder.state === "folder"
      ? localFolder.folder.versionVector
      : localFolder.deletedFolder.versionVector;
  const remoteVersionVector =
    remoteFolder.state === "folder"
      ? remoteFolder.folder.versionVector
      : remoteFolder.deletedFolder.versionVector;

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

export function findAllFoldersIds(
  localVault: Vault,
  remoteVault: Vault,
): Set<string> {
  return new Set([
    ...localVault.folders.map((folder) => folder.id),
    ...remoteVault.folders.map((folder) => folder.id),
    ...localVault.deletedFolders.map((deletedFolder) => deletedFolder.id),
    ...remoteVault.deletedFolders.map((deletedFolder) => deletedFolder.id),
  ]);
}
