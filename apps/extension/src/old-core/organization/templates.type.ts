/**
 * Organization template (archetype) types.
 *
 * Templates are starting configurations that pre-fill a new vault
 * with a sensible structure. They reference items from the Global Library.
 *
 * @see docs/design/password-organization.md Section 4
 */

export type TemplateComplexity = "basic" | "intermediate" | "advanced";

/**
 * Organization template definition.
 * References Global Library items by ID - does not define new items.
 */
export interface OrganizationTemplate {
  /** e.g., "archetype_standard_v1" */
  readonly id: string;
  /** e.g., "Standard", "Developer", "Family" */
  readonly label: string;
  readonly complexity: TemplateComplexity;
  readonly description: string;
  readonly folderIds: string[];
  readonly tagIds: string[];
}

/**
 * Template selection result after user customization.
 * Contains the actual items to create (potentially modified).
 */
export interface TemplateSelectionResult {
  readonly templateId: string;
  readonly folders: TemplateFolderSelection[];
  readonly tags: TemplateTagSelection[];
}

/**
 * Folder selection for template application.
 * Allows customization of folder properties before creation.
 */
export interface TemplateFolderSelection {
  readonly sourceId: string;
  name: string;
  icon: string;
  /** null = root */
  parentId: string | null;
  include: boolean;
}

/**
 * Tag selection for template application.
 * Allows customization of tag properties before creation.
 */
export interface TemplateTagSelection {
  readonly sourceId: string;
  name: string;
  readonly groupId: string;
  include: boolean;
}
