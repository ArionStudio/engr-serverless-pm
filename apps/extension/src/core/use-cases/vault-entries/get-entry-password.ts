import type { UnlockedVaultRepositoryPort } from "../../ports/unlocked-vault-repository.port";
import { PasswordEntryNotFoundError } from "../__errors/vault-entry.errors";
import { VaultMustBeUnlockedError } from "../__errors/vault-session.errors";

export type GetEntryPasswordCommandParams = {
  vaultId: string;
  entryId: string;
};

export type GetEntryPasswordResult = {
  password: string;
};

export class GetEntryPasswordUseCase {
  private readonly unlockedVaultRepository: UnlockedVaultRepositoryPort;

  constructor(unlockedVaultRepository: UnlockedVaultRepositoryPort) {
    this.unlockedVaultRepository = unlockedVaultRepository;
  }

  async execute(
    params: GetEntryPasswordCommandParams,
  ): Promise<GetEntryPasswordResult> {
    const unlockedVault = await this.unlockedVaultRepository.getUnlockedVault();

    if (unlockedVault?.vaultId !== params.vaultId) {
      throw new VaultMustBeUnlockedError(params.vaultId, "get entry password");
    }

    const entry = unlockedVault.vault.entries.find(
      (candidate) => candidate.id === params.entryId,
    );

    if (entry === undefined) {
      throw new PasswordEntryNotFoundError(params.vaultId, params.entryId);
    }

    return {
      password: entry.password,
    };
  }
}
