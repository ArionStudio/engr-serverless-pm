import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import { SyncNotConfiguredError } from "../../errors/sync.errors";

export type RemoveCloudSyncFilesCommandParams = {
  readonly vaultId: string;
};

/**
 * Deletes remote snapshots only. Use DisableSyncUseCase for user-facing sync
 * teardown; this leaves syncConfig intact, so later sync can recreate files.
 */
export class RemoveCloudSyncFilesUseCase {
  private readonly syncProvider: SyncProviderPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;

  constructor(
    syncProvider: SyncProviderPort,
    unlockedVaultSession: UnlockedVaultSessionService,
  ) {
    this.syncProvider = syncProvider;
    this.unlockedVaultSession = unlockedVaultSession;
  }

  async execute(params: RemoveCloudSyncFilesCommandParams): Promise<void> {
    const { unlockedVault } =
      await this.unlockedVaultSession.requireUnlockedVaultContext(
        params.vaultId,
        "remove cloud sync files",
      );
    const syncConfig = unlockedVault.vault.syncConfig;

    if (syncConfig === undefined) {
      throw new SyncNotConfiguredError(
        params.vaultId,
        "remove cloud sync files",
      );
    }

    await this.syncProvider.removeVaultSnapshots(syncConfig, params.vaultId);
  }
}
