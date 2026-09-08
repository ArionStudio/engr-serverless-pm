import { UNCATEGORIZED_FOLDER_ID } from "@lfspm/core";
import type { VisiblePasswordEntryFields } from "@lfspm/core";

export type EntrySearchKind = "any" | "login" | "tag" | "folder" | "website";
export type EntrySearchPrefix = "@" | "#" | "/" | ":";
export type EntrySearchTerm = {
  readonly kind: EntrySearchKind;
  readonly value: string;
  /** UTF-16 offsets into the original query, including prefix and quotes. End is exclusive. */
  readonly start: number;
  readonly end: number;
  readonly prefix?: EntrySearchPrefix;
};

type SearchableEntry = Pick<
  VisiblePasswordEntryFields,
  "login" | "sanitizedUrl" | "tags" | "folderId"
>;
type TagLabels = Readonly<Record<string, string>>;
type FolderNames = Readonly<Record<string, { readonly name: string }>>;
const emptyTags: TagLabels = {};
const emptyFolders: FolderNames = {};
const prefixKinds: Readonly<Record<EntrySearchPrefix, EntrySearchKind>> = {
  "@": "login",
  "#": "tag",
  "/": "folder",
  ":": "website",
};

function searchPrefix(value: string): EntrySearchPrefix | undefined {
  return value === "@" || value === "#" || value === "/" || value === ":"
    ? value
    : undefined;
}

/**
 * Whitespace separates terms outside double quotes. An unfinished quote consumes
 * the remaining query, so typing never produces a syntax error. Within quotes,
 * backslash escapes double quotes and backslashes; other backslashes stay literal.
 * A prefix is recognized only at the start of a token. Empty terms remain available
 * for completion but do not restrict matching.
 */
export function parseEntrySearch(query: string): EntrySearchTerm[] {
  const terms: EntrySearchTerm[] = [];
  let position = 0;
  while (position < query.length) {
    if (/\s/u.test(query[position])) {
      position += 1;
      continue;
    }
    const start = position;
    const prefix = searchPrefix(query[position]);
    if (prefix) position += 1;
    let quoted = false;
    let value = "";
    while (position < query.length) {
      const character = query[position];
      if (!quoted && /\s/u.test(character)) break;
      if (character === '"') {
        quoted = !quoted;
        position += 1;
      } else if (
        quoted &&
        character === "\\" &&
        (query[position + 1] === '"' || query[position + 1] === "\\")
      ) {
        value += query[position + 1];
        position += 2;
      } else {
        value += character;
        position += 1;
      }
    }
    terms.push({
      kind: prefix ? prefixKinds[prefix] : "any",
      value,
      start,
      end: position,
      ...(prefix ? { prefix } : {}),
    });
  }
  return terms;
}

/** Formats one literal value for query insertion, including values beginning with a prefix. */
export function quoteEntrySearchValue(value: string): string {
  return !value || /[\s"\\]/u.test(value) || searchPrefix(value[0])
    ? `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`
    : value;
}

function folderName(entry: SearchableEntry, folders: FolderNames): string {
  return (
    folders[entry.folderId]?.name ??
    (entry.folderId === UNCATEGORIZED_FOLDER_ID ? "Uncategorized" : "")
  );
}

/** Matches only visible fields. Every nonempty term must match its requested field. */
export function matchesEntrySearch(
  entry: SearchableEntry,
  terms: readonly EntrySearchTerm[],
  tagLabels: TagLabels = emptyTags,
  folders: FolderNames = emptyFolders,
): boolean {
  const fields = {
    login: [entry.login.toLowerCase()],
    website: [entry.sanitizedUrl.toLowerCase()],
    tag: entry.tags.map((id) => (tagLabels[id] ?? "").toLowerCase()),
    folder: [folderName(entry, folders).toLowerCase()],
  };
  return terms.every(({ kind, value }) => {
    if (!value) return true;
    const needle = value.toLowerCase();
    const values =
      kind === "any"
        ? [...fields.login, ...fields.website, ...fields.tag, ...fields.folder]
        : fields[kind];
    return values.some((field) => field.includes(needle));
  });
}

function uniqueValues(values: readonly string[]): string[] {
  const unique = new Map<string, string>();
  for (const value of values) {
    if (value && !unique.has(value.toLowerCase()))
      unique.set(value.toLowerCase(), value);
  }
  return [...unique.values()];
}

export function entrySearchSuggestions(
  entries: readonly SearchableEntry[],
  tagLabels: TagLabels = emptyTags,
  folders: FolderNames = emptyFolders,
): Partial<Record<Exclude<EntrySearchKind, "any">, readonly string[]>> {
  return {
    login: uniqueValues(entries.map((entry) => entry.login)),
    website: uniqueValues(
      entries.map((entry) => {
        try {
          return new URL(entry.sanitizedUrl).host || entry.sanitizedUrl;
        } catch {
          return entry.sanitizedUrl;
        }
      }),
    ),
    tag: uniqueValues(Object.values(tagLabels)),
    folder: uniqueValues([
      ...Object.values(folders).map(({ name }) => name),
      ...entries.map((entry) => folderName(entry, folders)),
    ]),
  };
}
