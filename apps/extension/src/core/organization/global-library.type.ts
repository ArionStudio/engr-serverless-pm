/**
 * Global library types for predefined folders and tags.
 *
 * The Global Library is a curated collection bundled with the extension
 * as a static JSON file. It's used to seed the user's local IndexedDB
 * and provide suggestions for new folders/tags.
 *
 * @see docs/design/password-organization.md Section 3
 */

import type { TagColor, TagShade } from "./tag.type";

/**
 * Global folder definition from the library.
 * Used for suggestions and initial seeding.
 */
export interface GlobalFolderDefinition {
  /** e.g., "f001" */
  readonly id: string;
  readonly name: string;
  /** e.g., "briefcase", "home" */
  readonly icon: string;
  readonly description?: string;
  /**
   * Parent suggestion:
   * - null = recommended as root-level
   * - "any" = flexible (root or subfolder)
   * - specific name = recommended as child of that folder
   */
  readonly parentSuggestion: string | null;
}

export interface GlobalTagGroupDefinition {
  /** e.g., "status", "topic" */
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly baseColor: TagColor;
  readonly description?: string;
}

export interface GlobalTagDefinition {
  /** e.g., "t001" */
  readonly id: string;
  readonly name: string;
  readonly color: TagColor;
  /** Shade within the color (default: 500) */
  readonly shade: TagShade;
  readonly groupId: string;
  readonly description?: string;
}

/**
 * Complete global library structure.
 * Loaded from src/assets/data/global-library.json
 */
export interface GlobalLibrary {
  readonly folders: GlobalFolderDefinition[];
  readonly tagGroups: GlobalTagGroupDefinition[];
  readonly tags: GlobalTagDefinition[];
}

export interface GlobalLibraryMetadata {
  /** semantic versioning */
  readonly version: string;
  /** Unix ms */
  readonly updatedAt: number;
  readonly folderCount: number;
  readonly tagGroupCount: number;
  readonly tagCount: number;
}
