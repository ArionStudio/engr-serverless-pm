export class VaultMustBeUnlockedError extends Error {
  constructor(vaultId: string, operation: string) {
    super(`Vault "${vaultId}" must be unlocked before ${operation}.`);
    this.name = "VaultMustBeUnlockedError";
  }
}

export class InvalidVaultLockDelayError extends Error {
  constructor(cause: unknown) {
    super("Vault lock delay is invalid.", { cause });
    this.name = "InvalidVaultLockDelayError";
  }
}

export {
  ActiveUnlockedVaultMismatchError,
  UnlockedVaultSessionInvalidError,
} from "../../ports/vault/unlocked-vault-repository.errors";
