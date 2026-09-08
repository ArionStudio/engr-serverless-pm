import type {
  PasswordEntry,
  VisiblePasswordEntryFields,
} from "./password-entry.type";

export function toVisiblePasswordEntryFields(
  entry: PasswordEntry,
): VisiblePasswordEntryFields {
  return {
    id: entry.id,
    hasPassword: entry.password.length > 0,
    login: entry.login,
    tags: [...entry.tags],
    sanitizedUrl: entry.sanitizedUrl,
    folderId: entry.folderId,
  };
}
