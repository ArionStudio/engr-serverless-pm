export class VaultMustBeUnlockedError extends Error {
  constructor(vaultId: string, operation: string) {
    super(`Vault "${vaultId}" must be unlocked before ${operation}.`);
    this.name = "VaultMustBeUnlockedError";
  }
}
