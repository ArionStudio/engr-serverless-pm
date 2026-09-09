/** Recheck authorization after failures that can revoke access without a notification. */
export function isVaultAuthorizationError(cause: unknown): boolean {
  return (
    cause instanceof Error &&
    [
      "ActiveVaultMustBeUnlockedError",
      "VaultMustBeUnlockedError",
      "UnlockedVaultSessionExpiredError",
      "UnlockedVaultSessionInvalidError",
    ].includes(cause.name)
  );
}

export async function vaultAuthorizationWasLost(
  cause: unknown,
  inspect: () => Promise<unknown>,
): Promise<boolean> {
  if (isVaultAuthorizationError(cause)) return true;
  try {
    await inspect();
    return false;
  } catch {
    return true;
  }
}
