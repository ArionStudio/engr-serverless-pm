import type { VisiblePasswordEntryFields } from "@lfspm/core";

export function getEntryAccessibleName(
  entry: Pick<VisiblePasswordEntryFields, "login" | "sanitizedUrl">,
) {
  return getEntryDestructiveIdentity(entry);
}

export function getEntryDestructiveIdentity(
  entry: Pick<VisiblePasswordEntryFields, "login" | "sanitizedUrl">,
) {
  const login = entry.login.trim();
  const website = entry.sanitizedUrl.trim();
  if (login && website) return `${login} at ${website}`;
  if (login) return login;
  return website ? `Unnamed login at ${website}` : "Unnamed login";
}
