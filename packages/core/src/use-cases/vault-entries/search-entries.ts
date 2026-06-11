import { toVisiblePasswordEntryFields } from "../../domain/entry/password-entry.mapper";
import { searchEntryQuerySchema } from "../../domain/entry/search-entry-query.schema";
import type { SearchEntryQuery } from "../../domain/entry/search-entry-query.type";
import { entryMatchesSearchQuery } from "../../domain/entry/search-entry-query.utils";
import type { VisiblePasswordEntryFields } from "../../domain/entry/password-entry.type";
import { InvalidSearchEntryQueryError } from "../../application/errors/vault-entry.errors";
import { VaultMustBeUnlockedError } from "../../application/errors/vault-session.errors";
import type { UnlockedVaultSessionService } from "../../application/vault-session/unlocked-vault-session.service";

export type SearchEntriesCommandParams = {
  vaultId: string;
  query: SearchEntryQuery;
};

export type SearchEntriesResult = {
  entries: VisiblePasswordEntryFields[];
};

export class SearchEntriesUseCase {
  private readonly unlockedVaultSession: UnlockedVaultSessionService;

  constructor(unlockedVaultSession: UnlockedVaultSessionService) {
    this.unlockedVaultSession = unlockedVaultSession;
  }

  async execute(
    params: SearchEntriesCommandParams,
  ): Promise<SearchEntriesResult> {
    const unlockedVaultSession = await this.unlockedVaultSession.get();
    const unlockedVault = unlockedVaultSession?.unlockedVault;

    if (unlockedVault?.vaultId !== params.vaultId) {
      throw new VaultMustBeUnlockedError(params.vaultId, "search entries");
    }

    const queryResult = searchEntryQuerySchema.safeParse(params.query);

    if (!queryResult.success) {
      throw new InvalidSearchEntryQueryError(queryResult.error);
    }

    const query = queryResult.data;
    const entries = unlockedVault.vault.entries
      .filter((entry) =>
        entryMatchesSearchQuery(entry, unlockedVault.vault, query),
      )
      .map(toVisiblePasswordEntryFields);

    return {
      entries,
    };
  }
}
