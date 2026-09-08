/** Recheck authorization after failures that can revoke access without a notification. */
export async function vaultAuthorizationWasLost(
  cause: unknown,
  inspect: () => Promise<unknown>,
): Promise<boolean> {
  if (
    cause instanceof Error &&
    [
      "VaultMustBeUnlockedError",
      "UnlockedVaultSessionExpiredError",
      "UnlockedVaultSessionInvalidError",
    ].includes(cause.name)
  ) {
    return true;
  }
  try {
    await inspect();
    return false;
  } catch {
    return true;
  }
}
