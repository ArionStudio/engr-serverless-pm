import type { LocalVaultDescriptor } from "../../domain/vault/local-vault-descriptor";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";

export type ListLocalVaultsResult = {
  vaults: LocalVaultDescriptor[];
};

export class ListLocalVaultsUseCase {
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;

  constructor(vaultLocalRepository: VaultLocalRepositoryPort) {
    this.vaultLocalRepository = vaultLocalRepository;
  }

  async execute(): Promise<ListLocalVaultsResult> {
    const vaults = await this.vaultLocalRepository.listLocalVaultDescriptors();

    return {
      vaults,
    };
  }
}
