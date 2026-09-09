import type { VisiblePasswordEntryFields } from "@lfspm/core";

export function getEntryAccessibleName(
  entry: Pick<VisiblePasswordEntryFields, "login" | "sanitizedUrl">,
) {
  const login = entry.login.trim();
  if (login) return login;
  const website = entry.sanitizedUrl.trim();
  return website ? `Unnamed login at ${website}` : "Unnamed login";
}
