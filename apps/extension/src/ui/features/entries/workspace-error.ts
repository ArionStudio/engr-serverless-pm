import { syncError } from "../sync/sync-error";
export function workspaceError(
  cause: unknown,
  action: "save" | "delete" = "save",
): string {
  if (!(cause instanceof Error))
    return "Could not complete this action. Try again.";
  switch (cause.name) {
    case "UnlockedVaultSessionInvalidError":
      return "This vault session could not be verified. Reload the extension page and unlock the vault again.";
    case "LocalVaultTrustCheckpointNotFoundError":
      return "This browser's vault trust record is missing. Changes are blocked. Keep this browser's data and use another trusted device to recover access.";
    case "LocalVaultTrustCheckpointInvalidError":
      return "This browser's vault trust record could not be verified. Changes are blocked. Keep this browser's data and use another trusted device to recover access.";
    case "PasswordEntryChangedError":
      if (action === "delete")
        return "This entry changed after you opened it. Cancel deletion, then reopen the entry to review its latest version.";
      return "This entry changed after you opened it. Discard your draft and reload before saving.";
    case "PasswordEntryNotFoundError":
      return "This entry has been deleted. Return to the entry list.";
    case "InvalidPasswordEntryError":
    case "UnsupportedEntryUrlProtocolError":
      return "Enter a login, a valid HTTP or HTTPS website, and a password.";
    case "PasswordEntryStrengthRequirementNotMetError":
      return "Use a strong password or explicitly allow this weak password.";
    case "DuplicateVaultEntryError":
      return "Could not create a unique entry identifier. Try again.";
    default:
      return syncError(cause, "Could not complete this action. Try again.");
  }
}
