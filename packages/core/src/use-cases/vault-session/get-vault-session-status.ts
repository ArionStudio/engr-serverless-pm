import type { UnlockedVaultSessionMaterialRepositoryPort } from "../../ports/vault/unlocked-vault-session-material-repository.port";

export type GetVaultSessionStatusResult =
  | {
      status: "locked";
    }
  | {
      status: "unlocked";
      vaultId: string;
    };

export class GetVaultSessionStatusUseCase {
  private readonly materialRepository: UnlockedVaultSessionMaterialRepositoryPort;

  constructor(materialRepository: UnlockedVaultSessionMaterialRepositoryPort) {
    this.materialRepository = materialRepository;
  }

  async execute(): Promise<GetVaultSessionStatusResult> {
    const material =
      await this.materialRepository.getUnlockedVaultSessionMaterial();

    if (material === null) {
      return {
        status: "locked",
      };
    }

    return {
      status: "unlocked",
      vaultId: material.vaultId,
    };
  }
}
