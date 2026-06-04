import type { UnlockedVaultSessionMaterialRepositoryPort } from "../../ports/vault/unlocked-vault-session-material-repository.port";
import { ActiveUnlockedVaultMismatchError } from "../../use-cases/__errors/vault-session.errors";

export class AssertUnlockedVaultSessionCanActivateService {
  private readonly materialRepository: UnlockedVaultSessionMaterialRepositoryPort;

  constructor(materialRepository: UnlockedVaultSessionMaterialRepositoryPort) {
    this.materialRepository = materialRepository;
  }

  async assertCanActivate(vaultId: string): Promise<void> {
    const activeMaterial =
      await this.materialRepository.getUnlockedVaultSessionMaterial();

    if (activeMaterial !== null && activeMaterial.vaultId !== vaultId) {
      throw new ActiveUnlockedVaultMismatchError(
        activeMaterial.vaultId,
        vaultId,
      );
    }
  }
}
