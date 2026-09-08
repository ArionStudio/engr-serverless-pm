export function folderError(cause: unknown): string {
  if (!(cause instanceof Error)) return "The folder could not be saved.";
  if (cause.name === "DuplicateVaultFolderNameError")
    return "A folder with this name already exists in this location.";
  if (cause.name === "VaultFolderChangedError")
    return "This folder changed on another device. Review the latest version and try again.";
  if (cause.name === "InvalidExpectedFolderVersionError")
    return "Reload folders and try again.";
  if (cause.name === "VaultFolderNotEmptyError")
    return "Move this folder's entries and subfolders before deleting it.";
  if (cause.name === "VaultFolderCycleError")
    return "A folder cannot be moved inside itself or one of its subfolders.";
  if (cause.name === "InvalidVaultFolderError")
    return "Enter a folder name up to 64 characters.";
  if (cause.name === "VaultFolderNotFoundError")
    return "This folder is no longer available. Reload folders and try again.";
  if (
    cause.name === "VaultMustBeUnlockedError" ||
    cause.name === "UnlockedVaultSessionExpiredError" ||
    cause.name === "UnlockedVaultSessionInvalidError" ||
    cause.name === "UnlockedVaultSessionChangedError"
  )
    return "Unlock this vault again before changing folders.";
  return "The folder could not be saved. Try again.";
}
