import type { UnlockedVaultSession } from "../../domain/vault/unlocked-vault-session";
import type { EncryptedUnlockedVaultSessionPayloadRepositoryPort } from "../../ports/vault/encrypted-unlocked-vault-session-payload-repository.port";
import { UnlockedVaultSessionInvalidError } from "../../use-cases/__errors/vault-session.errors";
import type { UnlockedVaultSessionMaterialRepositoryPort } from "../../ports/vault/unlocked-vault-session-material-repository.port";
import type { RestoreUnlockedVaultSessionService } from "./restore-unlocked-vault-session.service";

export class GetUnlockedVaultSessionService {
  private readonly materialRepository: UnlockedVaultSessionMaterialRepositoryPort;
  private readonly encryptedPayloadRepository: EncryptedUnlockedVaultSessionPayloadRepositoryPort;
  private readonly restoreUnlockedVaultSession: RestoreUnlockedVaultSessionService;

  constructor(
    materialRepository: UnlockedVaultSessionMaterialRepositoryPort,
    encryptedPayloadRepository: EncryptedUnlockedVaultSessionPayloadRepositoryPort,
    restoreUnlockedVaultSession: RestoreUnlockedVaultSessionService,
  ) {
    this.materialRepository = materialRepository;
    this.encryptedPayloadRepository = encryptedPayloadRepository;
    this.restoreUnlockedVaultSession = restoreUnlockedVaultSession;
  }

  async get(): Promise<UnlockedVaultSession | null> {
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

    return this.restoreUnlockedVaultSession.restore(material, encryptedPayload);
  }
}
