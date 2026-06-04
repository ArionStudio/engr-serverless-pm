import type { UnlockedVaultRepositoryPort } from "../../ports/vault/unlocked-vault-repository.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import { VaultMustBeUnlockedForLocalDeletionError } from "../__errors/delete-local-vault.errors";

export type DeleteLocalVaultCommandParams = {
  vaultId: string;
};

export class DeleteLocalVaultUseCase {
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;
  private readonly unlockedVaultRepository: UnlockedVaultRepositoryPort;

  constructor(
    vaultLocalRepository: VaultLocalRepositoryPort,
    unlockedVaultRepository: UnlockedVaultRepositoryPort,
  ) {
    this.vaultLocalRepository = vaultLocalRepository;
    this.unlockedVaultRepository = unlockedVaultRepository;
  }

  async execute(params: DeleteLocalVaultCommandParams): Promise<void> {
    const unlockedVaultSession =
      await this.unlockedVaultRepository.getUnlockedVaultSession();
    const unlockedVault = unlockedVaultSession?.unlockedVault;

    if (unlockedVault?.vaultId !== params.vaultId) {
      throw new VaultMustBeUnlockedForLocalDeletionError(params.vaultId);
    }

    await this.vaultLocalRepository.removePersistedLocalVault(params.vaultId);
    await this.unlockedVaultRepository.removeUnlockedVaultSession();
  }
}
