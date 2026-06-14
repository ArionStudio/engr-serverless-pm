import { toVisiblePasswordEntryFields } from "../../domain/entry/password-entry.mapper";
import type { VisiblePasswordEntryFields } from "../../domain/entry/password-entry.type";
import { PasswordEntryNotFoundError } from "../../errors/vault-entry.errors";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";

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
    const { unlockedVault } =
      await this.unlockedVaultSession.requireUnlockedVaultContext(
        params.vaultId,
        "read entry",
      );

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
