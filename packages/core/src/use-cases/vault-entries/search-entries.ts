import { toVisiblePasswordEntryFields } from "../../domain/entry/password-entry.mapper";
import { searchEntryQuerySchema } from "../../domain/entry/search-entry-query.schema";
import type { SearchEntryQuery } from "../../domain/entry/search-entry-query.type";
import { entryMatchesSearchQuery } from "../../domain/entry/search-entry-query.utils";
import type { VisiblePasswordEntryFields } from "../../domain/entry/password-entry.type";
import type { UnlockedVaultRepositoryPort } from "../../ports/vault/unlocked-vault-repository.port";
import { InvalidSearchEntryQueryError } from "../__errors/vault-entry.errors";
import { VaultMustBeUnlockedError } from "../__errors/vault-session.errors";

export type SearchEntriesCommandParams = {
  vaultId: string;
  query: SearchEntryQuery;
};

export type SearchEntriesResult = {
  entries: VisiblePasswordEntryFields[];
};

export class SearchEntriesUseCase {
  private readonly unlockedVaultRepository: UnlockedVaultRepositoryPort;

  constructor(unlockedVaultRepository: UnlockedVaultRepositoryPort) {
    this.unlockedVaultRepository = unlockedVaultRepository;
  }

  async execute(
    params: SearchEntriesCommandParams,
  ): Promise<SearchEntriesResult> {
    const unlockedVaultSession =
      await this.unlockedVaultRepository.getUnlockedVaultSession();
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
