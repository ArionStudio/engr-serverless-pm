import { SyncNotConfiguredError } from "../../application/errors/sync.errors";
import { VaultMustBeUnlockedError } from "../../application/errors/vault-session.errors";
import type { UnlockedVaultSessionService } from "../../application/vault-session/unlocked-vault-session.service";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";

export type RemoveCloudSyncFilesCommandParams = {
  readonly vaultId: string;
};

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
    const unlockedVaultSession = await this.unlockedVaultSession.get();
    const unlockedVault = unlockedVaultSession?.unlockedVault;

    if (unlockedVault?.vaultId !== params.vaultId) {
      throw new VaultMustBeUnlockedError(
        params.vaultId,
        "remove cloud sync files",
      );
    }

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
