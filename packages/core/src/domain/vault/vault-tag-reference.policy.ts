import {
  InvalidVaultTagReferenceError,
  VaultTagNotFoundError,
} from "../../errors/vault-tag.errors";
import type { Vault } from "./vault";

export function requireVaultTagsExist(
  vault: Vault,
  tagIds: readonly string[],
): void {
  const activeTagIds = new Set(vault.tags.map((tag) => tag.id));
  const missingTagId = tagIds.find((tagId) => !activeTagIds.has(tagId));

  if (missingTagId !== undefined) {
    throw new VaultTagNotFoundError(missingTagId);
  }
}

export function requireValidVaultTagReferences(vault: Vault): void {
  const activeTagIds = new Set(vault.tags.map((tag) => tag.id));

  for (const entry of vault.entries) {
    const missingTagId = entry.tags.find((tagId) => !activeTagIds.has(tagId));
    if (missingTagId !== undefined) {
      throw new InvalidVaultTagReferenceError(entry.id, missingTagId);
    }
  }
}
