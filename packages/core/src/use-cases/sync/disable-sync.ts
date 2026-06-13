import { requireVaultSyncConfig } from "../../services/sync/sync-config.utils";
import type { UnlockedVaultSessionService } from "../../services/vault-session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../services/vault-snapshots/vault-snapshot.service";
import { removeVaultSyncConfig } from "../../domain/vault/vault-sync-config.mutations";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";

export type DisableSyncCommandParams = {
  readonly vaultId: string;
};

export class DisableSyncUseCase {
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

  async execute(params: DisableSyncCommandParams): Promise<void> {
    const { sourceSnapshotRevision, unlockedVault } =
      await this.unlockedVaultSession.requireUnlockedVaultContext(
        params.vaultId,
        "disable sync",
      );
    const syncConfig = requireVaultSyncConfig(
      params.vaultId,
      "disable sync",
      unlockedVault.vault,
    );

    const updatedUnlockedVault = {
      ...unlockedVault,
      vault: removeVaultSyncConfig(unlockedVault.vault),
    };

    await this.vaultSnapshot.requireUnlockedVaultCanBePersisted(
      params.vaultId,
      updatedUnlockedVault,
      sourceSnapshotRevision,
    );

    await this.syncProvider.removeVaultSnapshots(syncConfig, params.vaultId);

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
