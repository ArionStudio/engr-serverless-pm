export function tagError(cause: unknown): string {
  if (!(cause instanceof Error)) return "The tag could not be saved.";
  if (cause.name === "DuplicateVaultTagNameError")
    return "A tag with this name already exists.";
  if (cause.name === "VaultTagChangedError")
    return "This tag changed on another device. Review the latest version and try again.";
  if (cause.name === "VaultTagInUseError")
    return "Remove this tag from its entries before deleting it.";
  if (cause.name === "InvalidVaultTagError")
    return "Enter a tag name between 1 and 32 characters.";
  if (
    cause.name === "VaultMustBeUnlockedError" ||
    cause.name === "UnlockedVaultSessionExpiredError" ||
    cause.name === "UnlockedVaultSessionInvalidError" ||
    cause.name === "UnlockedVaultSessionChangedError"
  )
    return "Unlock this vault again before changing tags.";
  return "The tag could not be saved. Try again.";
}
