import type { UnlockedVaultSession } from "../../domain/vault/unlocked-vault-session";
import type { EncryptedUnlockedVaultSessionPayloadRepositoryPort } from "../../ports/vault/encrypted-unlocked-vault-session-payload-repository.port";
import { UnlockedVaultSessionInvalidError } from "../__errors/vault-session.errors";
import type { UnlockedVaultSessionMaterialRepositoryPort } from "../../ports/vault/unlocked-vault-session-material-repository.port";
import type { RestoreUnlockedVaultSessionUseCase } from "./restore-unlocked-vault-session";

export class GetUnlockedVaultSessionUseCase {
  private readonly materialRepository: UnlockedVaultSessionMaterialRepositoryPort;
  private readonly encryptedPayloadRepository: EncryptedUnlockedVaultSessionPayloadRepositoryPort;
  private readonly restoreUnlockedVaultSession: RestoreUnlockedVaultSessionUseCase;

  constructor(
    materialRepository: UnlockedVaultSessionMaterialRepositoryPort,
    encryptedPayloadRepository: EncryptedUnlockedVaultSessionPayloadRepositoryPort,
    restoreUnlockedVaultSession: RestoreUnlockedVaultSessionUseCase,
  ) {
    this.materialRepository = materialRepository;
    this.encryptedPayloadRepository = encryptedPayloadRepository;
    this.restoreUnlockedVaultSession = restoreUnlockedVaultSession;
  }

  async execute(): Promise<UnlockedVaultSession | null> {
    const material =
      await this.materialRepository.getUnlockedVaultSessionMaterial();

    if (material === null) {
      return null;
    }

    const encryptedPayload =
      await this.encryptedPayloadRepository.getEncryptedUnlockedVaultSessionPayload();

    if (encryptedPayload === null) {
      throw new UnlockedVaultSessionInvalidError(
        "encrypted payload is missing",
      );
    }

    return this.restoreUnlockedVaultSession.execute({
      material,
      encryptedPayload,
    });
  }
}
