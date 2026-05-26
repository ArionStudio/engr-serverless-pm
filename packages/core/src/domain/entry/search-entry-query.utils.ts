import type { Vault } from "../vault/vault";
import type { PasswordEntry } from "./password-entry.type";
import type { SearchEntryQuery } from "./search-entry-query.type";

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
    matchesAllTags(entry, query.tag)
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
    entryTagNames(entry, vault).some((tagName) => tagName.includes(value))
  );
}

function matchesOptionalText(value: string, query: string): boolean {
  const normalizedQuery = normalizeSearchValue(query);

  return (
    normalizedQuery === "" || value.toLowerCase().includes(normalizedQuery)
  );
}

function matchesAllTags(entry: PasswordEntry, queryTagIds: number[]): boolean {
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

function normalizeSearchValue(value: string): string {
  return value.trim().toLowerCase();
}
