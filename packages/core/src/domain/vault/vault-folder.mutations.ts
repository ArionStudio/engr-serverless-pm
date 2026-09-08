import {
  DuplicateVaultFolderError,
  VaultFolderNotEmptyError,
} from "../../errors/vault-organization.errors";
import type {
  Folder,
  FolderId,
  FolderInput,
} from "../organization/folder.type";
import { incrementVersionVector } from "../versioning/version-vector.utils";
import type { Vault } from "./vault";
import {
  requireFolderMoveDoesNotCreateCycle,
  requireFolderParent,
  requireUniqueSiblingFolderName,
} from "./vault-folder.policy";

export function addFolderToVault(
  vault: Vault,
  input: FolderInput,
  deviceId: string,
): Vault {
  if (vault.folders.some((folder) => folder.id === input.id)) {
    throw new DuplicateVaultFolderError(input.id);
  }
  requireFolderParent(vault, input.parentId);
  requireUniqueSiblingFolderName(vault, input.name, input.parentId);
  const versionVector = incrementVersionVector(vault.versionVector, deviceId);
  const deleted = vault.deletedFolders.find((folder) => folder.id === input.id);
  const folder: Folder = {
    ...input,
    versionVector:
      deleted === undefined
        ? { [deviceId]: versionVector[deviceId] }
        : incrementVersionVector(deleted.versionVector, deviceId),
  };
  return {
    ...vault,
    versionVector,
    folders: [...vault.folders, folder],
    deletedFolders: vault.deletedFolders.filter((item) => item.id !== input.id),
  };
}

export function updateFolderInVault(
  vault: Vault,
  folderId: FolderId,
  input: Pick<FolderInput, "name" | "icon" | "description">,
  deviceId: string,
): Vault {
  const index = vault.folders.findIndex((folder) => folder.id === folderId);
  if (index === -1) return vault;
  const current = vault.folders[index];
  requireUniqueSiblingFolderName(vault, input.name, current.parentId, folderId);
  const folders = [...vault.folders];
  folders[index] = {
    ...current,
    ...input,
    versionVector: incrementVersionVector(current.versionVector, deviceId),
  };
  return {
    ...vault,
    versionVector: incrementVersionVector(vault.versionVector, deviceId),
    folders,
  };
}

export function moveFolderInVault(
  vault: Vault,
  folderId: FolderId,
  parentId: FolderId | null,
  deviceId: string,
): Vault {
  const index = vault.folders.findIndex((folder) => folder.id === folderId);
  if (index === -1) return vault;
  requireFolderParent(vault, parentId);
  requireFolderMoveDoesNotCreateCycle(vault, folderId, parentId);
  const current = vault.folders[index];
  requireUniqueSiblingFolderName(vault, current.name, parentId, folderId);
  const folders = [...vault.folders];
  folders[index] = {
    ...current,
    parentId,
    versionVector: incrementVersionVector(current.versionVector, deviceId),
  };
  return {
    ...vault,
    versionVector: incrementVersionVector(vault.versionVector, deviceId),
    folders,
  };
}

export function removeFolderFromVault(
  vault: Vault,
  folderId: FolderId,
  deviceId: string,
  deletedAt: number,
): Vault {
  const folder = vault.folders.find((item) => item.id === folderId);
  if (folder === undefined) return vault;
  const entryCount = vault.entries.filter(
    (entry) => entry.folderId === folderId,
  ).length;
  const childCount = vault.folders.filter(
    (item) => item.parentId === folderId,
  ).length;
  if (entryCount > 0 || childCount > 0) {
    throw new VaultFolderNotEmptyError(folderId, entryCount, childCount);
  }
  return {
    ...vault,
    versionVector: incrementVersionVector(vault.versionVector, deviceId),
    folders: vault.folders.filter((item) => item.id !== folderId),
    deletedFolders: [
      ...vault.deletedFolders.filter((item) => item.id !== folderId),
      {
        id: folderId,
        versionVector: incrementVersionVector(folder.versionVector, deviceId),
        deletedAt,
      },
    ],
  };
}
