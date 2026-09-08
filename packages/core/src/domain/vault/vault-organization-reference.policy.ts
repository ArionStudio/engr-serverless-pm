import { InvalidVaultOrganizationReferenceError } from "../../errors/vault-organization.errors";
import { tagSchema } from "../entry/tag.schema";
import {
  folderSchema,
  UNCATEGORIZED_FOLDER_ID,
} from "../organization/folder.schema";
import type { FolderId } from "../organization/folder.type";
import type { Vault } from "./vault";
import {
  VaultFolderNotFoundError,
  VaultTagGroupNotFoundError,
} from "../../errors/vault-organization.errors";

function normalizedName(name: string): string {
  return name.trim().normalize("NFKC").toLowerCase();
}

type VaultOrganizationReferences = {
  readonly tags: readonly Pick<
    Vault["tags"][number],
    "id" | "name" | "groupId"
  >[];
  readonly deletedTags: readonly Pick<Vault["deletedTags"][number], "id">[];
  readonly folders: readonly Pick<
    Vault["folders"][number],
    "id" | "name" | "parentId"
  >[];
  readonly deletedFolders: readonly Pick<
    Vault["deletedFolders"][number],
    "id"
  >[];
  readonly tagGroups: readonly Pick<
    Vault["tagGroups"][number],
    "id" | "name"
  >[];
  readonly entries: readonly Pick<
    Vault["entries"][number],
    "id" | "folderId"
  >[];
};

export function requireValidVaultOrganization(
  vault: VaultOrganizationReferences,
): void {
  if (
    [...vault.tags, ...vault.deletedTags].some(
      (tag) => !tagSchema.shape.id.safeParse(tag.id).success,
    ) ||
    [...vault.folders, ...vault.deletedFolders].some(
      (folder) => !folderSchema.shape.id.safeParse(folder.id).success,
    )
  ) {
    throw new InvalidVaultOrganizationReferenceError(
      "Vault organization contains an invalid or reserved identity.",
    );
  }
  const tagGroupIds = new Set<string>();
  const tagGroupNames = new Set<string>();
  for (const group of vault.tagGroups) {
    const normalized = normalizedName(group.name);
    if (tagGroupIds.has(group.id) || tagGroupNames.has(normalized)) {
      throw new InvalidVaultOrganizationReferenceError(
        "Vault tag groups must have unique IDs and names.",
      );
    }
    tagGroupIds.add(group.id);
    tagGroupNames.add(normalized);
  }

  for (const tag of vault.tags) {
    if (!tagGroupIds.has(tag.groupId)) {
      throw new InvalidVaultOrganizationReferenceError(
        `Tag "${tag.id}" references missing group "${tag.groupId}".`,
      );
    }
  }

  const tagIds = new Set<string>();
  const tagNames = new Set<string>();
  const deletedTagIds = new Set(vault.deletedTags.map((tag) => tag.id));
  if (deletedTagIds.size !== vault.deletedTags.length) {
    throw new InvalidVaultOrganizationReferenceError(
      "Vault deleted tags must have unique identities.",
    );
  }
  for (const tag of vault.tags) {
    const normalized = normalizedName(tag.name);
    if (
      tagIds.has(tag.id) ||
      deletedTagIds.has(tag.id) ||
      tagNames.has(normalized)
    ) {
      throw new InvalidVaultOrganizationReferenceError(
        "Vault tags must have unique active identities and names.",
      );
    }
    tagIds.add(tag.id);
    tagNames.add(normalized);
  }

  const folderIds = new Set(vault.folders.map((folder) => folder.id));
  const deletedFolderIds = new Set(
    vault.deletedFolders.map((folder) => folder.id),
  );
  if (
    folderIds.size !== vault.folders.length ||
    deletedFolderIds.size !== vault.deletedFolders.length ||
    [...folderIds].some((id) => deletedFolderIds.has(id))
  ) {
    throw new InvalidVaultOrganizationReferenceError(
      "Vault folders contain a reserved or duplicate identity.",
    );
  }

  const siblingNames = new Map<FolderId | null, Set<string>>();
  for (const folder of vault.folders) {
    if (folder.parentId !== null && !folderIds.has(folder.parentId)) {
      throw new InvalidVaultOrganizationReferenceError(
        `Folder "${folder.id}" references missing parent "${folder.parentId}".`,
      );
    }
    const names = siblingNames.get(folder.parentId) ?? new Set<string>();
    const name = normalizedName(folder.name);
    if (names.has(name)) {
      throw new InvalidVaultOrganizationReferenceError(
        "Sibling folder names must be unique.",
      );
    }
    names.add(name);
    siblingNames.set(folder.parentId, names);
    requireAcyclicFolder(vault, folder.id);
  }

  for (const entry of vault.entries) {
    if (
      entry.folderId !== UNCATEGORIZED_FOLDER_ID &&
      !folderIds.has(entry.folderId)
    ) {
      throw new InvalidVaultOrganizationReferenceError(
        `Entry "${entry.id}" references missing folder "${entry.folderId}".`,
      );
    }
  }
}

export function requireVaultFolderExists(
  vault: Vault,
  folderId: FolderId,
): void {
  if (
    folderId !== UNCATEGORIZED_FOLDER_ID &&
    !vault.folders.some((folder) => folder.id === folderId)
  ) {
    throw new VaultFolderNotFoundError(folderId);
  }
}

export function requireVaultTagGroupExists(
  vault: Vault,
  groupId: string,
): void {
  if (!vault.tagGroups.some((group) => group.id === groupId)) {
    throw new VaultTagGroupNotFoundError(groupId);
  }
}

function requireAcyclicFolder(
  vault: Pick<VaultOrganizationReferences, "folders">,
  folderId: FolderId,
): void {
  const byId = new Map(vault.folders.map((folder) => [folder.id, folder]));
  const visited = new Set<FolderId>();
  let currentId: FolderId | null = folderId;
  while (currentId !== null) {
    if (visited.has(currentId)) {
      throw new InvalidVaultOrganizationReferenceError(
        "Vault folders contain a parent cycle.",
      );
    }
    visited.add(currentId);
    currentId = byId.get(currentId)?.parentId ?? null;
  }
}
