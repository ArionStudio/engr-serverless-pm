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
 *
 * All fields are readonly to prevent accidental mutation of decrypted data.
 * Use FolderInput/FolderUpdate for creation and modification operations.
 */
export interface Folder {
  /** UUID */
  readonly id: string;
  readonly name: string;
  /** e.g., "briefcase", "home", "server" */
  readonly icon: string;
  readonly description: string | null;
  /** null = root level */
  readonly parentId: string | null;
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
