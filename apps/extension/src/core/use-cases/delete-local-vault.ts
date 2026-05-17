import type { UnlockedVaultRepositoryPort } from "../ports/unlocked-vault-repository.port";
import type { VaultLocalRepositoryPort } from "../ports/vault-local-repository.port";
import { VaultMustBeUnlockedForLocalDeletionError } from "./errors/delete-local-vault.errors";

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
    const unlockedVault = await this.unlockedVaultRepository.getUnlockedVault();

    if (unlockedVault?.vaultId !== params.vaultId) {
      throw new VaultMustBeUnlockedForLocalDeletionError(params.vaultId);
    }

    await this.vaultLocalRepository.removeLocalVaultDescriptor(params.vaultId);
    await this.vaultLocalRepository.removeDeviceAccessMaterial(params.vaultId);
    await this.vaultLocalRepository.removeVaultSnapshot(params.vaultId);
    await this.unlockedVaultRepository.removeUnlockedVault();
  }
}
