import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import {
  compareVaultSnapshotDescriptors,
  toVaultSnapshotDescriptor,
} from "../../domain/snapshot/vault-snapshot-descriptor.utils";
import {
  RemoteVaultSnapshotAheadError,
  RemoteVaultSnapshotIntegrityError,
  SyncNotConfiguredError,
} from "../../errors/sync.errors";

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

  async execute(params: RemoveCloudSyncFilesCommandParams): Promise<void> {
    const { sourceSnapshotVersionVector, unlockedVault } =
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

    const localSnapshot =
      await this.vaultSnapshot.requireCurrentSnapshotForUnlockedVault(
        params.vaultId,
        unlockedVault,
        sourceSnapshotVersionVector,
      );
    const remoteSnapshotDescriptor =
      await this.syncProvider.getLatestVaultSnapshotDescriptor(
        syncConfig,
        params.vaultId,
      );

    if (remoteSnapshotDescriptor !== null) {
      const relation = compareVaultSnapshotDescriptors(
        toVaultSnapshotDescriptor(params.vaultId, localSnapshot),
        remoteSnapshotDescriptor,
      );

      if (relation === "remote_ahead") {
        throw new RemoteVaultSnapshotAheadError(params.vaultId);
      }

      if (relation === "broken") {
        throw new RemoteVaultSnapshotIntegrityError(params.vaultId);
      }
    }

    await this.syncProvider.removeVaultSnapshots(syncConfig, params.vaultId);
  }
}
