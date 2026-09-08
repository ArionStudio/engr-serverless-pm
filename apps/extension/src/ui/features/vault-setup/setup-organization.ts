import { resolveSuggestedFolderParent } from "@lfspm/core";
import type {
  GlobalLibrary,
  InitializeVaultOrganizationInput,
} from "@lfspm/core";

export type OrganizationSetupDraft = InitializeVaultOrganizationInput & {
  readonly templateId: string | null;
};

export type OrganizationSetupNameConflicts = {
  readonly folderIds: ReadonlySet<string>;
  readonly tagIds: ReadonlySet<string>;
};

function normalizedSetupName(value: string): string {
  return value.trim().normalize("NFKC").toLowerCase();
}

function addDuplicateIds(
  idsByName: ReadonlyMap<string, readonly string[]>,
  conflicts: Set<string>,
): void {
  for (const ids of idsByName.values()) {
    if (ids.length > 1) ids.forEach((id) => conflicts.add(id));
  }
}

export function findOrganizationSetupNameConflicts(
  value: OrganizationSetupDraft,
): OrganizationSetupNameConflicts {
  const tagIdsByName = new Map<string, string[]>();
  for (const tag of value.tags) {
    const name = normalizedSetupName(tag.name);
    if (!name) continue;
    const ids = tagIdsByName.get(name) ?? [];
    ids.push(tag.id);
    tagIdsByName.set(name, ids);
  }

  const folderIdsByParentAndName = new Map<
    string | null,
    Map<string, string[]>
  >();
  for (const folder of value.folders) {
    const name = normalizedSetupName(folder.name);
    if (!name) continue;
    const idsByName =
      folderIdsByParentAndName.get(folder.parentId) ??
      new Map<string, string[]>();
    const ids = idsByName.get(name) ?? [];
    ids.push(folder.id);
    idsByName.set(name, ids);
    folderIdsByParentAndName.set(folder.parentId, idsByName);
  }

  const folderIds = new Set<string>();
  for (const idsByName of folderIdsByParentAndName.values())
    addDuplicateIds(idsByName, folderIds);
  const tagIds = new Set<string>();
  addDuplicateIds(tagIdsByName, tagIds);
  return { folderIds, tagIds };
}

export function createOrganizationSetupDraft(
  library: GlobalLibrary,
  templateId: string | null,
): OrganizationSetupDraft {
  if (templateId === null) return { templateId, folders: [], tags: [] };
  const template = library.templates.find(({ id }) => id === templateId);
  if (!template) return { templateId: null, folders: [], tags: [] };
  const selectedFolders = library.folders.filter(({ id }) =>
    template.folderIds.includes(id),
  );
  return {
    templateId,
    folders: selectedFolders.map(({ id, name, icon, description, parent }) => ({
      id,
      name,
      icon,
      description,
      parentId: resolveSuggestedFolderParent(selectedFolders, parent),
    })),
    tags: library.tags
      .filter(({ id }) => template.tagIds.includes(id))
      .map(({ id, name, groupId, color, shade }) => ({
        id,
        name,
        groupId,
        color,
        shade,
      })),
  };
}
