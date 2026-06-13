import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import { VaultMustBeUnlockedForLocalDeletionError } from "../../services/errors/delete-local-vault.errors";
import type { UnlockedVaultSessionService } from "../../services/vault-session/unlocked-vault-session.service";

export type DeleteLocalVaultCommandParams = {
  vaultId: string;
};

export class DeleteLocalVaultUseCase {
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;

  constructor(
    vaultLocalRepository: VaultLocalRepositoryPort,
    unlockedVaultSession: UnlockedVaultSessionService,
  ) {
    this.vaultLocalRepository = vaultLocalRepository;
    this.unlockedVaultSession = unlockedVaultSession;
  }

  async execute(params: DeleteLocalVaultCommandParams): Promise<void> {
    const unlockedVaultSession = await this.unlockedVaultSession.get();
    const unlockedVault = unlockedVaultSession?.unlockedVault;

    if (unlockedVault?.vaultId !== params.vaultId) {
      throw new VaultMustBeUnlockedForLocalDeletionError(params.vaultId);
    }

    await this.unlockedVaultSession.remove();
    await this.vaultLocalRepository.removePersistedLocalVault(params.vaultId);
  }
}
