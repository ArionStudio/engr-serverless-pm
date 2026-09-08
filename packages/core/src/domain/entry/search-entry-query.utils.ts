import type { Vault } from "../vault/vault";
import type { PasswordEntry } from "./password-entry.type";
import type { SearchEntryQuery } from "./search-entry-query.type";
import { UNCATEGORIZED_FOLDER_ID } from "../organization/folder.schema";

export function entryMatchesSearchQuery(
  entry: PasswordEntry,
  vault: Vault,
  query: SearchEntryQuery,
): boolean {
  if (query.mode === "any") {
    return entryMatchesAnyQuery(entry, vault, query.value);
  }

  return (
    matchesOptionalText(entry.login, query.login) &&
    matchesOptionalText(entry.sanitizedUrl, query.url) &&
    matchesAllTags(entry, query.tag) &&
    matchesFolder(entry, query.folder)
  );
}

function entryMatchesAnyQuery(
  entry: PasswordEntry,
  vault: Vault,
  queryValue: string,
): boolean {
  const value = normalizeSearchValue(queryValue);

  if (value === "") {
    return true;
  }

  return (
    entry.login.toLowerCase().includes(value) ||
    entry.sanitizedUrl.toLowerCase().includes(value) ||
    entryTagNames(entry, vault).some((tagName) => tagName.includes(value)) ||
    entryFolderName(entry, vault).includes(value)
  );
}

function matchesFolder(entry: PasswordEntry, folderIds: string[]): boolean {
  return folderIds.length === 0 || folderIds.includes(entry.folderId);
}

function matchesOptionalText(value: string, query: string): boolean {
  const normalizedQuery = normalizeSearchValue(query);

  return (
    normalizedQuery === "" || value.toLowerCase().includes(normalizedQuery)
  );
}

function matchesAllTags(entry: PasswordEntry, queryTagIds: string[]): boolean {
  if (queryTagIds.length === 0) {
    return true;
  }

  const entryTagIds = new Set(entry.tags);

  return queryTagIds.every((queryTagId) => entryTagIds.has(queryTagId));
}

function entryTagNames(entry: PasswordEntry, vault: Vault): string[] {
  const entryTagIds = new Set(entry.tags);

  return vault.tags
    .filter((tag) => entryTagIds.has(tag.id))
    .map((tag) => tag.name.toLowerCase());
}

function entryFolderName(entry: PasswordEntry, vault: Vault): string {
  if (entry.folderId === UNCATEGORIZED_FOLDER_ID) return "uncategorized";
  return (
    vault.folders.find((folder) => folder.id === entry.folderId)?.name ?? ""
  ).toLowerCase();
}

function normalizeSearchValue(value: string): string {
  return value.trim().toLowerCase();
}
