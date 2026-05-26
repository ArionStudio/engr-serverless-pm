import type { UnlockedVaultRepositoryPort } from "../../ports/unlocked-vault-repository.port";

export type GetVaultSessionStatusResult =
  | {
      status: "locked";
    }
  | {
      status: "unlocked";
      vaultId: string;
    };

export class GetVaultSessionStatusUseCase {
  private readonly unlockedVaultRepository: UnlockedVaultRepositoryPort;

  constructor(unlockedVaultRepository: UnlockedVaultRepositoryPort) {
    this.unlockedVaultRepository = unlockedVaultRepository;
  }

  async execute(): Promise<GetVaultSessionStatusResult> {
    const unlockedVault = await this.unlockedVaultRepository.getUnlockedVault();

    if (unlockedVault === null) {
      return {
        status: "locked",
      };
    }

    return {
      status: "unlocked",
      vaultId: unlockedVault.vaultId,
    };
  }
}
