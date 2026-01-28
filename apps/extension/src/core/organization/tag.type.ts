/**
 * Tag and tag group types for password organization.
 *
 * Tags represent context/attributes with color-coded visual identity.
 * Tags are organized into groups for UI display.
 *
 * @see docs/design/password-organization.md
 */

export type TagColor =
  | "gray"
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "purple"
  | "pink";

/**
 * Tailwind-compatible shade values for tag colors.
 * Allows multiple tags in the same group to have visual distinction
 * while maintaining the group's color theme.
 *
 * - 300: Lightest (subtle, background-friendly)
 * - 400: Light
 * - 500: Default (standard intensity)
 * - 600: Dark
 * - 700: Darkest (high contrast)
 */
export type TagShade = 300 | 400 | 500 | 600 | 700;

/**
 * Tag group for organizing related tags.
 * Groups define visual themes that tags inherit.
 */
export interface TagGroup {
  /** e.g., "status", "topic" */
  readonly id: string;
  name: string;
  /** e.g., "bell", "tag" */
  icon: string;
  baseColor: TagColor;
  description: string | null;
}

/**
 * Individual tag for labeling passwords.
 * Inherits visual properties from its group but can override color.
 */
export interface Tag {
  /** UUID */
  readonly id: string;
  name: string;
  readonly groupId: string;
  /** Inherited from group's baseColor, can be overridden */
  color: TagColor;
  /** User-selected shade within the color (default: 500) */
  shade: TagShade;
  /** Unix ms */
  readonly createdAt: number;
}

export interface TagGroupInput {
  name: string;
  icon: string;
  baseColor: TagColor;
  description?: string | null;
}

export interface TagInput {
  name: string;
  groupId: string;
  /** Optional, defaults to group's baseColor */
  color?: TagColor;
  /** Optional, defaults to 500 */
  shade?: TagShade;
}

/**
 * Tag with resolved group information for display.
 */
export interface TagWithGroup extends Tag {
  readonly groupName: string;
  readonly groupIcon: string;
}
