import type { SyncConfig } from "../../domain/sync/sync-config.type";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import { InvalidSyncConfigError } from "../../errors/sync.errors";
import type { UnlockedVaultSessionService } from "../../services/vault-session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../services/vault-snapshots/vault-snapshot.service";

export type SetupSyncCommandParams = {
  readonly vaultId: string;
  readonly syncConfig: SyncConfig;
};

export class SetupSyncUseCase {
  private readonly syncProvider: SyncProviderPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultSnapshot: VaultSnapshotService;

  constructor(
    syncProvider: SyncProviderPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultSnapshot: VaultSnapshotService,
  ) {
    this.syncProvider = syncProvider;
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultSnapshot = vaultSnapshot;
  }

  async execute(params: SetupSyncCommandParams): Promise<void> {
    const { sourceSnapshotRevision, unlockedVault } =
      await this.unlockedVaultSession.getUnlockedVaultContext(
        params.vaultId,
        "setup sync",
      );

    let syncConfig: SyncConfig;

    try {
      syncConfig = await this.syncProvider.setup(params.syncConfig);
    } catch (error) {
      throw new InvalidSyncConfigError(error);
    }

    const updatedUnlockedVault = {
      ...unlockedVault,
      vault: {
        ...unlockedVault.vault,
        syncConfig,
      },
    };

    const persistedSnapshot = await this.vaultSnapshot.persistUnlockedVault(
      params.vaultId,
      updatedUnlockedVault,
      sourceSnapshotRevision,
    );

    await this.unlockedVaultSession.commitPersistedSnapshot(
      updatedUnlockedVault,
      persistedSnapshot.revision,
    );
  }
}
