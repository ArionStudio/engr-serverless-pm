import type { GlobalFolderDefinition } from "./global-library.type";

export function normalizeLibraryName(value: string): string {
  return value.normalize("NFKC").toLowerCase();
}

/** Resolve a library parent suggestion against the folders available to the caller. */
export function resolveSuggestedFolderParent(
  folders: readonly Pick<GlobalFolderDefinition, "id" | "name">[],
  parent: string | null,
): string | null {
  if (parent === null || parent === "any") return null;
  const expected = normalizeLibraryName(parent);
  return (
    folders.find((folder) => normalizeLibraryName(folder.name) === expected)
      ?.id ?? null
  );
}
