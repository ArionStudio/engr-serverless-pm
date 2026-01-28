/**
 * Folder types for password organization.
 *
 * Folders represent location/placement with hierarchical structure.
 * Each folder has an icon for visual identity.
 *
 * @see docs/design/password-organization.md
 */

/**
 * Folder for organizing passwords.
 * Supports unlimited nesting (UI warns beyond 2 levels).
 */
export interface Folder {
  /** UUID */
  readonly id: string;
  name: string;
  /** e.g., "briefcase", "home", "server" */
  icon: string;
  description: string | null;
  /** null = root level */
  parentId: string | null;
  /** Unix ms */
  readonly createdAt: number;
}

export interface FolderInput {
  name: string;
  icon: string;
  description?: string | null;
  parentId?: string | null;
}

export interface FolderUpdate {
  readonly id: string;
  name?: string;
  icon?: string;
  description?: string | null;
  parentId?: string | null;
}

/**
 * Folder with computed depth for UI display.
 */
export interface FolderWithDepth extends Folder {
  /** 0 = root level */
  readonly depth: number;
}
