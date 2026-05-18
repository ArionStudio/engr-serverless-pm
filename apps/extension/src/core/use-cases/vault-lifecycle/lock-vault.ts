import type { UnlockedVaultRepositoryPort } from "../../ports/unlocked-vault-repository.port";

export class LockVaultUseCase {
  private readonly unlockedVaultRepository: UnlockedVaultRepositoryPort;

  constructor(unlockedVaultRepository: UnlockedVaultRepositoryPort) {
    this.unlockedVaultRepository = unlockedVaultRepository;
  }

  async execute(): Promise<void> {
    await this.unlockedVaultRepository.removeUnlockedVault();
  }
}
