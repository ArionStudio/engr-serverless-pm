import type { UnlockedVaultSession } from "../../domain/vault/unlocked-vault-session";
import type { EncryptedUnlockedVaultSessionPayloadRepositoryPort } from "../../ports/vault/encrypted-unlocked-vault-session-payload-repository.port";
import { ActiveUnlockedVaultMismatchError } from "../../ports/vault/unlocked-vault-repository.errors";
import type { UnlockedVaultSessionMaterialRepositoryPort } from "../../ports/vault/unlocked-vault-session-material-repository.port";
import type { ProtectUnlockedVaultSessionUseCase } from "./protect-unlocked-vault-session";

export type SaveUnlockedVaultSessionCommandParams = {
  readonly session: UnlockedVaultSession;
};

export class SaveUnlockedVaultSessionUseCase {
  private readonly materialRepository: UnlockedVaultSessionMaterialRepositoryPort;
  private readonly encryptedPayloadRepository: EncryptedUnlockedVaultSessionPayloadRepositoryPort;
  private readonly protectUnlockedVaultSession: ProtectUnlockedVaultSessionUseCase;

  constructor(
    materialRepository: UnlockedVaultSessionMaterialRepositoryPort,
    encryptedPayloadRepository: EncryptedUnlockedVaultSessionPayloadRepositoryPort,
    protectUnlockedVaultSession: ProtectUnlockedVaultSessionUseCase,
  ) {
    this.materialRepository = materialRepository;
    this.encryptedPayloadRepository = encryptedPayloadRepository;
    this.protectUnlockedVaultSession = protectUnlockedVaultSession;
  }

  async execute(params: SaveUnlockedVaultSessionCommandParams): Promise<void> {
    const activeMaterial =
      await this.materialRepository.getUnlockedVaultSessionMaterial();
    const incomingVaultId = params.session.unlockedVault.vaultId;

    if (activeMaterial !== null && activeMaterial.vaultId !== incomingVaultId) {
      throw new ActiveUnlockedVaultMismatchError(
        activeMaterial.vaultId,
        incomingVaultId,
      );
    }

    const protectedSession = await this.protectUnlockedVaultSession.execute({
      session: params.session,
    });

    await this.encryptedPayloadRepository.saveEncryptedUnlockedVaultSessionPayload(
      protectedSession.encryptedPayload,
    );
    await this.materialRepository.saveUnlockedVaultSessionMaterial(
      protectedSession.material,
    );
  }
}
