import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import { VaultMustBeUnlockedForLocalDeletionError } from "../__errors/delete-local-vault.errors";
import type { GetUnlockedVaultSessionUseCase } from "../vault-session/get-unlocked-vault-session";
import type { RemoveUnlockedVaultSessionUseCase } from "../vault-session/remove-unlocked-vault-session";

export type DeleteLocalVaultCommandParams = {
  vaultId: string;
};

export class DeleteLocalVaultUseCase {
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;
  private readonly getUnlockedVaultSession: GetUnlockedVaultSessionUseCase;
  private readonly removeUnlockedVaultSession: RemoveUnlockedVaultSessionUseCase;

  constructor(
    vaultLocalRepository: VaultLocalRepositoryPort,
    getUnlockedVaultSession: GetUnlockedVaultSessionUseCase,
    removeUnlockedVaultSession: RemoveUnlockedVaultSessionUseCase,
  ) {
    this.vaultLocalRepository = vaultLocalRepository;
    this.getUnlockedVaultSession = getUnlockedVaultSession;
    this.removeUnlockedVaultSession = removeUnlockedVaultSession;
  }

  async execute(params: DeleteLocalVaultCommandParams): Promise<void> {
    const unlockedVaultSession = await this.getUnlockedVaultSession.execute();
    const unlockedVault = unlockedVaultSession?.unlockedVault;

    if (unlockedVault?.vaultId !== params.vaultId) {
      throw new VaultMustBeUnlockedForLocalDeletionError(params.vaultId);
    }

    await this.vaultLocalRepository.removePersistedLocalVault(params.vaultId);
    await this.removeUnlockedVaultSession.execute();
  }
}
