import { toVisiblePasswordEntryFields } from "../../domain/entry/password-entry.mapper";
import type { VisiblePasswordEntryFields } from "../../domain/entry/password-entry.type";
import { PasswordEntryNotFoundError } from "../../application/errors/vault-entry.errors";
import { VaultMustBeUnlockedError } from "../../application/errors/vault-session.errors";
import type { UnlockedVaultSessionService } from "../../application/vault-session/unlocked-vault-session.service";

export type ReadEntryCommandParams = {
  vaultId: string;
  entryId: string;
};

export type ReadEntryResult = {
  entry: VisiblePasswordEntryFields;
};

export class ReadEntryUseCase {
  private readonly unlockedVaultSession: UnlockedVaultSessionService;

  constructor(unlockedVaultSession: UnlockedVaultSessionService) {
    this.unlockedVaultSession = unlockedVaultSession;
  }

  async execute(params: ReadEntryCommandParams): Promise<ReadEntryResult> {
    const unlockedVaultSession = await this.unlockedVaultSession.get();
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
