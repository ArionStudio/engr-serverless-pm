export class VaultMustBeUnlockedForLocalDeletionError extends Error {
  constructor(vaultId: string) {
    super(`Vault "${vaultId}" must be unlocked before local deletion.`);
    this.name = "VaultMustBeUnlockedForLocalDeletionError";
  }
}
