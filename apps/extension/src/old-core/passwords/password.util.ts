/**
 * Password utility functions.
 */

import type { Password, PasswordMetadata } from "./password.type";

/**
 * Extract metadata from a full password entry.
 */
export function extractPasswordMetadata(password: Password): PasswordMetadata {
  return {
    id: password.id,
    title: password.title,
    username: password.username,
    url: password.url,
    folderId: password.folderId,
    tags: password.tags,
    modifiedAt: password.modifiedAt,
  };
}
