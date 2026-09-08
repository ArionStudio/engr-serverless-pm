import { resolveSuggestedFolderParent } from "@lfspm/core";
import type {
  GlobalLibrary,
  InitializeVaultOrganizationInput,
} from "@lfspm/core";

export type OrganizationSetupDraft = InitializeVaultOrganizationInput & {
  readonly templateId: string | null;
};

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
