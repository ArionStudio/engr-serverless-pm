import { VaultMustBeUnlockedError } from "./vault-session.errors";

export class VaultMustBeUnlockedForLocalDeletionError extends VaultMustBeUnlockedError {
  constructor(vaultId: string) {
    super(vaultId, "local deletion");
    this.name = "VaultMustBeUnlockedForLocalDeletionError";
  }
}
