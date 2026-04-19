/**
 * Tag constants for password organization.
 *
 * @see docs/design/password-organization.md
 */

/**
 * Default tag group for uncategorized tags.
 */
export const DEFAULT_TAG_GROUP_ID = "other";

/**
 * Soft limit for active tags to prevent "tag fatigue".
 */
export const MAX_RECOMMENDED_TAGS = 50;

/**
 * Tailwind-compatible shade values for tag colors.
 * Allows visual distinction between tags in the same group.
 */
export const TAG_SHADES = [300, 400, 500, 600, 700] as const;

/**
 * Default shade for new tags (standard intensity).
 */
export const DEFAULT_TAG_SHADE = 500 as const;
