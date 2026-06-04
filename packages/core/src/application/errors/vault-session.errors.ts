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

export class UnlockedVaultSessionInvalidError extends Error {
  constructor(reason: string, options?: ErrorOptions) {
    super(`Unlocked vault session is invalid: ${reason}.`, options);
    this.name = "UnlockedVaultSessionInvalidError";
  }
}

export class ActiveUnlockedVaultMismatchError extends Error {
  constructor(activeVaultId: string, incomingVaultId: string) {
    super(
      `Cannot save unlocked vault "${incomingVaultId}" while vault "${activeVaultId}" is already unlocked.`,
    );
    this.name = "ActiveUnlockedVaultMismatchError";
  }
}
