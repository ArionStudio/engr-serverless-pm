import type { VisibleVaultFields } from "../../domain/vault/visible-vault.type";
import { toVisibleVaultFields } from "../../domain/vault/visible-vault.mapper";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";

export class ReadVaultWorkspaceUseCase {
  private readonly session: UnlockedVaultSessionService;
  constructor(session: UnlockedVaultSessionService) {
    this.session = session;
  }

  async execute({ vaultId }: { vaultId: string }): Promise<VisibleVaultFields> {
    return this.session.runWithUnlockedVaultContext(
      vaultId,
      "read vault workspace",
      ({ unlockedVault }) =>
        Promise.resolve(toVisibleVaultFields(unlockedVault.vault)),
    );
  }
}
