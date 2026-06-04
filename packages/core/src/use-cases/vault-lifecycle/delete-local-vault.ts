import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import { VaultMustBeUnlockedForLocalDeletionError } from "../../application/errors/delete-local-vault.errors";
import type { GetUnlockedVaultSessionService } from "../../application/vault-session/get-unlocked-vault-session.service";
import type { RemoveUnlockedVaultSessionService } from "../../application/vault-session/remove-unlocked-vault-session.service";

export type DeleteLocalVaultCommandParams = {
  vaultId: string;
};

export class DeleteLocalVaultUseCase {
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;
  private readonly getUnlockedVaultSession: GetUnlockedVaultSessionService;
  private readonly removeUnlockedVaultSession: RemoveUnlockedVaultSessionService;

  constructor(
    vaultLocalRepository: VaultLocalRepositoryPort,
    getUnlockedVaultSession: GetUnlockedVaultSessionService,
    removeUnlockedVaultSession: RemoveUnlockedVaultSessionService,
  ) {
    this.vaultLocalRepository = vaultLocalRepository;
    this.getUnlockedVaultSession = getUnlockedVaultSession;
    this.removeUnlockedVaultSession = removeUnlockedVaultSession;
  }

  async execute(params: DeleteLocalVaultCommandParams): Promise<void> {
    const unlockedVaultSession = await this.getUnlockedVaultSession.get();
    const unlockedVault = unlockedVaultSession?.unlockedVault;

    if (unlockedVault?.vaultId !== params.vaultId) {
      throw new VaultMustBeUnlockedForLocalDeletionError(params.vaultId);
    }

    await this.removeUnlockedVaultSession.remove();
    await this.vaultLocalRepository.removePersistedLocalVault(params.vaultId);
  }
}
