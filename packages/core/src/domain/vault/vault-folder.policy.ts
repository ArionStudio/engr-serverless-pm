import {
  DuplicateVaultFolderNameError,
  VaultFolderCycleError,
  VaultFolderNotFoundError,
} from "../../errors/vault-organization.errors";
import { UNCATEGORIZED_FOLDER_ID } from "../organization/folder.schema";
import type { FolderId } from "../organization/folder.type";
import type { Vault } from "./vault";

function normalizedName(name: string): string {
  return name.trim().normalize("NFKC").toLowerCase();
}

export function requireFolderParent(
  vault: Vault,
  parentId: FolderId | null,
): void {
  if (parentId === null) return;
  if (
    parentId === UNCATEGORIZED_FOLDER_ID ||
    !vault.folders.some((folder) => folder.id === parentId)
  ) {
    throw new VaultFolderNotFoundError(parentId);
  }
}

export function requireUniqueSiblingFolderName(
  vault: Vault,
  name: string,
  parentId: FolderId | null,
  ignoredFolderId?: FolderId,
): void {
  const target = normalizedName(name);
  if (
    vault.folders.some(
      (folder) =>
        folder.id !== ignoredFolderId &&
        folder.parentId === parentId &&
        normalizedName(folder.name) === target,
    )
  ) {
    throw new DuplicateVaultFolderNameError();
  }
}

export function requireFolderMoveDoesNotCreateCycle(
  vault: Vault,
  folderId: FolderId,
  parentId: FolderId | null,
): void {
  if (parentId === null) return;
  if (folderId === parentId) throw new VaultFolderCycleError();

  const byId = new Map(vault.folders.map((folder) => [folder.id, folder]));
  const visited = new Set<FolderId>();
  let currentId: FolderId | null = parentId;
  while (currentId !== null) {
    if (currentId === folderId || visited.has(currentId)) {
      throw new VaultFolderCycleError();
    }
    visited.add(currentId);
    currentId = byId.get(currentId)?.parentId ?? null;
  }
}
