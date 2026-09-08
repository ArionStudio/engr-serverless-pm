import {
  normalizeLibraryName,
  resolveSuggestedFolderParent,
} from "./global-library.utils";
import { z } from "zod";
import {
  tagColorSchema,
  tagGroupIdSchema,
  tagShadeSchema,
} from "../entry/tag.schema";
import { folderIdSchema } from "./folder.schema";
import { tagGroupSchema } from "./tag-group.schema";

const libraryTextSchema = z.string().trim().min(1).max(256);

export const globalFolderDefinitionSchema = z.object({
  id: folderIdSchema,
  name: z.string().trim().min(1).max(64),
  icon: z.string().trim().min(1).max(128),
  parent: z.string().trim().min(1).max(64).nullable(),
  description: libraryTextSchema,
});

export const globalTagDefinitionSchema = z.object({
  id: z.string().trim().min(1).max(128),
  name: z.string().trim().min(1).max(32),
  color: tagColorSchema,
  shade: tagShadeSchema,
  groupId: tagGroupIdSchema,
  description: libraryTextSchema,
  aliases: z.array(z.string().trim().min(1).max(64)).default([]),
});

export const organizationTemplateComplexitySchema = z.enum([
  "basic",
  "intermediate",
  "advanced",
]);

export const organizationTemplateSchema = z.object({
  id: z.string().trim().min(1).max(128),
  label: z.string().trim().min(1).max(64),
  complexity: organizationTemplateComplexitySchema,
  folderIds: z.array(folderIdSchema),
  tagIds: z.array(z.string().trim().min(1).max(128)),
});

export const globalLibrarySchema = z
  .object({
    folders: z.array(globalFolderDefinitionSchema),
    tagGroups: z.array(tagGroupSchema),
    tags: z.array(globalTagDefinitionSchema),
    templates: z.array(organizationTemplateSchema),
  })
  .superRefine((library, context) => {
    const folderIds = new Set(library.folders.map((folder) => folder.id));
    const tagGroupIds = new Set(library.tagGroups.map((group) => group.id));
    const tagIds = new Set(library.tags.map((tag) => tag.id));

    requireUniqueValues(
      library.folders.map((folder) => folder.id),
      "Folder IDs must be unique.",
      context,
    );
    requireUniqueValues(
      library.folders.map((folder) => normalizeLibraryName(folder.name)),
      "Folder names must be unique.",
      context,
    );
    requireUniqueValues(
      library.tagGroups.map((group) => group.id),
      "Tag-group IDs must be unique.",
      context,
    );
    requireUniqueValues(
      library.tags.map((tag) => tag.id),
      "Tag IDs must be unique.",
      context,
    );
    requireUniqueValues(
      library.tags.map((tag) => normalizeLibraryName(tag.name)),
      "Tag names must be unique.",
      context,
    );
    requireUniqueValues(
      library.templates.map((template) => template.id),
      "Template IDs must be unique.",
      context,
    );

    for (const folder of library.folders) {
      if (
        folder.parent !== null &&
        folder.parent !== "any" &&
        resolveSuggestedFolderParent(library.folders, folder.parent) === null
      ) {
        addLibraryIssue(
          context,
          `Folder "${folder.id}" has an unknown parent suggestion.`,
        );
      }
    }
    for (const tag of library.tags) {
      if (!tagGroupIds.has(tag.groupId)) {
        addLibraryIssue(
          context,
          `Tag "${tag.id}" references an unknown tag group.`,
        );
      }
      requireUniqueValues(
        tag.aliases.map(normalizeLibraryName),
        `Tag "${tag.id}" has duplicate aliases.`,
        context,
      );
    }
    for (const template of library.templates) {
      if (template.folderIds.some((folderId) => !folderIds.has(folderId))) {
        addLibraryIssue(
          context,
          `Template "${template.id}" references an unknown folder.`,
        );
      }
      if (template.tagIds.some((tagId) => !tagIds.has(tagId))) {
        addLibraryIssue(
          context,
          `Template "${template.id}" references an unknown tag.`,
        );
      }
    }
  });

function requireUniqueValues(
  values: readonly string[],
  message: string,
  context: z.RefinementCtx,
): void {
  if (new Set(values).size !== values.length) addLibraryIssue(context, message);
}

function addLibraryIssue(context: z.RefinementCtx, message: string): void {
  context.addIssue({ code: "custom", message });
}
