import type { EncryptedUnlockedVaultSessionPayloadRepositoryPort } from "../../ports/vault/encrypted-unlocked-vault-session-payload-repository.port";
import type { UnlockedVaultSessionMaterialRepositoryPort } from "../../ports/vault/unlocked-vault-session-material-repository.port";

export class RemoveUnlockedVaultSessionUseCase {
  private readonly materialRepository: UnlockedVaultSessionMaterialRepositoryPort;
  private readonly encryptedPayloadRepository: EncryptedUnlockedVaultSessionPayloadRepositoryPort;

  constructor(
    materialRepository: UnlockedVaultSessionMaterialRepositoryPort,
    encryptedPayloadRepository: EncryptedUnlockedVaultSessionPayloadRepositoryPort,
  ) {
    this.materialRepository = materialRepository;
    this.encryptedPayloadRepository = encryptedPayloadRepository;
  }

  async execute(): Promise<void> {
    let materialRemoveError: unknown;

    try {
      await this.materialRepository.removeUnlockedVaultSessionMaterial();
    } catch (error) {
      materialRemoveError = error;
    }

    try {
      await this.encryptedPayloadRepository.removeEncryptedUnlockedVaultSessionPayload();
    } catch (error) {
      if (materialRemoveError === undefined) {
        throw error;
      }
    }

    if (materialRemoveError !== undefined) {
      throw materialRemoveError;
    }
  }
}
