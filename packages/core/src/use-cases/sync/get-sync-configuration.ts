import type { SyncTarget } from "../../domain/sync/sync-config.type";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";

export type GetSyncConfigurationResult = { readonly target: SyncTarget | null };

export class GetSyncConfigurationUseCase {
  private readonly session: UnlockedVaultSessionService;
  constructor(session: UnlockedVaultSessionService) {
    this.session = session;
  }

  async execute(params: {
    readonly vaultId: string;
  }): Promise<GetSyncConfigurationResult> {
    const { unlockedVault } = await this.session.requireUnlockedVaultContext(
      params.vaultId,
      "read sync configuration",
    );
    const target = unlockedVault.vault.syncTarget;
    return {
      target:
        target === undefined
          ? null
          : (JSON.parse(JSON.stringify(target)) as SyncTarget),
    };
  }
}
