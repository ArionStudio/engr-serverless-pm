import { DuplicateVaultTagNameError } from "../../errors/vault-tag.errors";
import type { Vault } from "./vault";

function normalizedTagName(name: string): string {
  return name.trim().normalize("NFKC").toLowerCase();
}

export function requireUniqueVaultTagName(
  vault: Vault,
  name: string,
  ignoredTagId?: string,
): void {
  const normalizedName = normalizedTagName(name);
  if (
    vault.tags.some(
      (tag) =>
        tag.id !== ignoredTagId &&
        normalizedTagName(tag.name) === normalizedName,
    )
  ) {
    throw new DuplicateVaultTagNameError();
  }
}
