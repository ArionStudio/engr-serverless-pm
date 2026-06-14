import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import {
  compareVaultSnapshotDescriptors,
  toVaultSnapshotDescriptor,
} from "../../domain/snapshot/vault-snapshot-descriptor.utils";
import { removeVaultSyncConfig } from "../../domain/vault/vault-sync-config.mutations";
import {
  RemoteVaultSnapshotAheadError,
  RemoteVaultSnapshotIntegrityError,
  SyncNotConfiguredError,
} from "../../errors/sync.errors";
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
    const { sourceSnapshotVersionVector, unlockedVault } =
      await this.unlockedVaultSession.requireUnlockedVaultContext(
        params.vaultId,
        "disable sync",
      );
    const syncConfig = unlockedVault.vault.syncConfig;

    if (syncConfig === undefined) {
      throw new SyncNotConfiguredError(params.vaultId, "disable sync");
    }

    const updatedUnlockedVault = {
      ...unlockedVault,
      vault: removeVaultSyncConfig(unlockedVault.vault),
    };

    const localSnapshot =
      await this.vaultSnapshot.requireCurrentSnapshotForUnlockedVault(
        params.vaultId,
        updatedUnlockedVault,
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

    const persistedSnapshot = await this.vaultSnapshot.persistUnlockedVault(
      params.vaultId,
      updatedUnlockedVault,
      sourceSnapshotVersionVector,
    );

    await this.unlockedVaultSession.commitPersistedSnapshot(
      updatedUnlockedVault,
      persistedSnapshot.snapshotVersionVector,
    );
  }
}
