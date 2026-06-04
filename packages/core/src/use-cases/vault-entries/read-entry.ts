import { toVisiblePasswordEntryFields } from "../../domain/entry/password-entry.mapper";
import type { VisiblePasswordEntryFields } from "../../domain/entry/password-entry.type";
import { PasswordEntryNotFoundError } from "../__errors/vault-entry.errors";
import { VaultMustBeUnlockedError } from "../__errors/vault-session.errors";
import type { GetUnlockedVaultSessionService } from "../../application/vault-session/get-unlocked-vault-session.service";

export type ReadEntryCommandParams = {
  vaultId: string;
  entryId: string;
};

export type ReadEntryResult = {
  entry: VisiblePasswordEntryFields;
};

export class ReadEntryUseCase {
  private readonly getUnlockedVaultSession: GetUnlockedVaultSessionService;

  constructor(getUnlockedVaultSession: GetUnlockedVaultSessionService) {
    this.getUnlockedVaultSession = getUnlockedVaultSession;
  }

  async execute(params: ReadEntryCommandParams): Promise<ReadEntryResult> {
    const unlockedVaultSession = await this.getUnlockedVaultSession.get();
    const unlockedVault = unlockedVaultSession?.unlockedVault;

    if (unlockedVault?.vaultId !== params.vaultId) {
      throw new VaultMustBeUnlockedError(params.vaultId, "read entry");
    }

    const entry = unlockedVault.vault.entries.find(
      (candidate) => candidate.id === params.entryId,
    );

    if (entry === undefined) {
      throw new PasswordEntryNotFoundError(params.vaultId, params.entryId);
    }

    return {
      entry: toVisiblePasswordEntryFields(entry),
    };
  }
}
