import type { UnlockedVaultRepositoryPort } from "../../ports/vault/unlocked-vault-repository.port";

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
    const unlockedVaultSession =
      await this.unlockedVaultRepository.getUnlockedVaultSession();
    const unlockedVault = unlockedVaultSession?.unlockedVault;

    if (unlockedVault === undefined) {
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
