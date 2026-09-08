import {
  DuplicateVaultTagError,
  VaultTagInUseError,
} from "../../errors/vault-tag.errors";
import type { Tag, TagInput } from "../entry/tag.type";
import { incrementVersionVector } from "../versioning/version-vector.utils";
import type { Vault } from "./vault";
import { requireUniqueVaultTagName } from "./vault-tag-name.policy";

export function addTagToVault(
  vault: Vault,
  tagInput: TagInput,
  deviceId: string,
): Vault {
  if (vault.tags.some((tag) => tag.id === tagInput.id)) {
    throw new DuplicateVaultTagError(tagInput.id);
  }
  requireUniqueVaultTagName(vault, tagInput.name);

  const versionVector = incrementVersionVector(vault.versionVector, deviceId);
  const deletedTag = vault.deletedTags.find((tag) => tag.id === tagInput.id);
  const tag: Tag = {
    ...tagInput,
    versionVector:
      deletedTag === undefined
        ? { [deviceId]: versionVector[deviceId] }
        : incrementVersionVector(deletedTag.versionVector, deviceId),
  };

  return {
    ...vault,
    versionVector,
    tags: [...vault.tags, tag],
    deletedTags: vault.deletedTags.filter((item) => item.id !== tagInput.id),
  };
}

export function updateTagInVault(
  vault: Vault,
  tagId: string,
  input: Omit<TagInput, "id" | "createdAt">,
  deviceId: string,
): Vault {
  const index = vault.tags.findIndex((tag) => tag.id === tagId);
  if (index === -1) return vault;
  requireUniqueVaultTagName(vault, input.name, tagId);

  const tags = [...vault.tags];
  const current = tags[index];
  const versionVector = incrementVersionVector(vault.versionVector, deviceId);
  tags[index] = {
    ...current,
    ...input,
    versionVector: incrementVersionVector(current.versionVector, deviceId),
  };
  return { ...vault, versionVector, tags };
}

export function removeTagFromVault(
  vault: Vault,
  tagId: string,
  deviceId: string,
  deletedAt: number,
): Vault {
  const tag = vault.tags.find((item) => item.id === tagId);
  if (tag === undefined) return vault;
  const entryCount = vault.entries.filter((entry) =>
    entry.tags.includes(tagId),
  ).length;
  if (entryCount > 0) throw new VaultTagInUseError(tagId, entryCount);

  const versionVector = incrementVersionVector(vault.versionVector, deviceId);
  return {
    ...vault,
    versionVector,
    tags: vault.tags.filter((item) => item.id !== tagId),
    deletedTags: [
      ...vault.deletedTags.filter((item) => item.id !== tagId),
      {
        id: tagId,
        versionVector: incrementVersionVector(tag.versionVector, deviceId),
        deletedAt,
      },
    ],
  };
}
