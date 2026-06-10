import type { EncryptedUnlockedVaultSessionPayloadRepositoryPort } from "../../ports/vault/encrypted-unlocked-vault-session-payload-repository.port";
import type { UnlockedVaultSessionMaterialRepositoryPort } from "../../ports/vault/unlocked-vault-session-material-repository.port";

export class RemoveUnlockedVaultSessionService {
  private readonly materialRepository: UnlockedVaultSessionMaterialRepositoryPort;
  private readonly encryptedPayloadRepository: EncryptedUnlockedVaultSessionPayloadRepositoryPort;

  constructor(
    materialRepository: UnlockedVaultSessionMaterialRepositoryPort,
    encryptedPayloadRepository: EncryptedUnlockedVaultSessionPayloadRepositoryPort,
  ) {
    this.materialRepository = materialRepository;
    this.encryptedPayloadRepository = encryptedPayloadRepository;
  }

  async remove(): Promise<void> {
    let removalError: unknown;

    try {
      await this.materialRepository.removeUnlockedVaultSessionMaterial();
    } catch (error) {
      removalError = error;
    }

    try {
      await this.encryptedPayloadRepository.removeEncryptedUnlockedVaultSessionPayload();
    } catch (error) {
      if (removalError === undefined) {
        removalError = error;
      }
    }

    if (removalError !== undefined) {
      throw removalError;
    }
  }
}
