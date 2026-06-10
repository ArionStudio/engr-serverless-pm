export class PersistedVaultMismatchError extends Error {
  constructor(expectedVaultId: string, actualVaultId: string) {
    super(
      `Cannot persist unlocked vault "${actualVaultId}" as vault "${expectedVaultId}".`,
    );
    this.name = "PersistedVaultMismatchError";
  }
}
