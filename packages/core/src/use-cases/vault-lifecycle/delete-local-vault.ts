import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import { VaultMustBeUnlockedForLocalDeletionError } from "../../errors/delete-local-vault.errors";
import type { VaultLifecycleCleanupService } from "../../services/session/vault-lifecycle-cleanup.service";

export type DeleteLocalVaultCommandParams = {
  vaultId: string;
};

export class DeleteLocalVaultUseCase {
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;
  private readonly lifecycleCleanup: VaultLifecycleCleanupService;

  constructor(
    vaultLocalRepository: VaultLocalRepositoryPort,
    lifecycleCleanup: VaultLifecycleCleanupService,
  ) {
    this.vaultLocalRepository = vaultLocalRepository;
    this.lifecycleCleanup = lifecycleCleanup;
  }

  async execute(params: DeleteLocalVaultCommandParams): Promise<void> {
    const cleanupResult = await this.lifecycleCleanup.cleanup({
      afterSessionRemoval: async () => {
        await this.vaultLocalRepository.removePersistedLocalVault(
          params.vaultId,
        );
      },
      requiredVaultId: params.vaultId,
    });

    if (cleanupResult === "session_unavailable") {
      throw new VaultMustBeUnlockedForLocalDeletionError(params.vaultId);
    }
  }
}
