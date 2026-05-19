import type { PasswordEntry } from "../../domain/entry/password-entry.type";
import type { UnlockedVaultRepositoryPort } from "../../ports/unlocked-vault-repository.port";
import { VaultMustBeUnlockedError } from "../__errors/vault-session.errors";

export type SearchEntriesCommandParams = {
  vaultId: string;
  query: string;
};

export type SearchEntriesResult = {
  entries: Array<Omit<PasswordEntry, "password">>;
};

export class SearchEntriesUseCase {
  private readonly unlockedVaultRepository: UnlockedVaultRepositoryPort;

  constructor(unlockedVaultRepository: UnlockedVaultRepositoryPort) {
    this.unlockedVaultRepository = unlockedVaultRepository;
  }

  async execute(
    params: SearchEntriesCommandParams,
  ): Promise<SearchEntriesResult> {
    const unlockedVault = await this.unlockedVaultRepository.getUnlockedVault();

    if (unlockedVault?.vaultId !== params.vaultId) {
      throw new VaultMustBeUnlockedError(params.vaultId, "search entries");
    }

    const normalizedQuery = params.query.trim().toLowerCase();
    const entries = unlockedVault.vault.entries
      .filter((entry) => {
        if (normalizedQuery === "") {
          return true;
        }

        return (
          entry.login.toLowerCase().includes(normalizedQuery) ||
          entry.sanitizedUrl.toLowerCase().includes(normalizedQuery)
        );
      })
      .map((entry) => ({
        id: entry.id,
        login: entry.login,
        tags: entry.tags,
        sanitizedUrl: entry.sanitizedUrl,
      }));

    return {
      entries,
    };
  }
}
