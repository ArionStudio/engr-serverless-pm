import type { UnlockedVaultSession } from "../../domain/vault/unlocked-vault-session";
import type { EncryptedUnlockedVaultSessionPayloadRepositoryPort } from "../../ports/vault/encrypted-unlocked-vault-session-payload-repository.port";
import { ActiveUnlockedVaultMismatchError } from "../errors/vault-session.errors";
import type { UnlockedVaultSessionMaterialRepositoryPort } from "../../ports/vault/unlocked-vault-session-material-repository.port";
import type { ProtectUnlockedVaultSessionService } from "./protect-unlocked-vault-session.service";

export class SaveUnlockedVaultSessionService {
  private readonly materialRepository: UnlockedVaultSessionMaterialRepositoryPort;
  private readonly encryptedPayloadRepository: EncryptedUnlockedVaultSessionPayloadRepositoryPort;
  private readonly protectUnlockedVaultSession: ProtectUnlockedVaultSessionService;

  constructor(
    materialRepository: UnlockedVaultSessionMaterialRepositoryPort,
    encryptedPayloadRepository: EncryptedUnlockedVaultSessionPayloadRepositoryPort,
    protectUnlockedVaultSession: ProtectUnlockedVaultSessionService,
  ) {
    this.materialRepository = materialRepository;
    this.encryptedPayloadRepository = encryptedPayloadRepository;
    this.protectUnlockedVaultSession = protectUnlockedVaultSession;
  }

  async save(session: UnlockedVaultSession): Promise<void> {
    const activeMaterial =
      await this.materialRepository.getUnlockedVaultSessionMaterial();
    const incomingVaultId = session.unlockedVault.vaultId;

    if (activeMaterial !== null && activeMaterial.vaultId !== incomingVaultId) {
      throw new ActiveUnlockedVaultMismatchError(
        activeMaterial.vaultId,
        incomingVaultId,
      );
    }

    const protectedSession = await this.protectUnlockedVaultSession.protect(
      session,
      activeMaterial ?? undefined,
    );

    if (activeMaterial !== null) {
      await this.encryptedPayloadRepository.saveEncryptedUnlockedVaultSessionPayload(
        protectedSession.encryptedPayload,
      );
      await this.materialRepository.saveUnlockedVaultSessionMaterial(
        protectedSession.material,
      );
      return;
    }

    await this.encryptedPayloadRepository.saveEncryptedUnlockedVaultSessionPayload(
      protectedSession.encryptedPayload,
    );
    await this.materialRepository.saveUnlockedVaultSessionMaterial(
      protectedSession.material,
    );
  }
}
