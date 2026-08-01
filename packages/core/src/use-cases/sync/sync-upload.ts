import {
  areVaultSnapshotDescriptorsEqual,
  compareVaultSnapshotDescriptors,
  toVaultSnapshotDescriptor,
} from "../../domain/snapshot/vault-snapshot-descriptor.utils";
import {
  RemoteVaultSnapshotAheadError,
  RemoteVaultSnapshotChangedError,
  RemoteVaultSnapshotIntegrityError,
  SyncConflictDetectedError,
  SyncNotConfiguredError,
  SyncRemovalPendingError,
} from "../../errors/sync.errors";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import type { VaultSyncGuardService } from "../../services/sync";

export type SyncUploadCommandParams = {
  readonly vaultId: string;
};

export class SyncUploadUseCase {
  private readonly syncProvider: SyncProviderPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultSnapshot: VaultSnapshotService;
  private readonly vaultSyncGuard: VaultSyncGuardService;

  constructor(
    syncProvider: SyncProviderPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultSnapshot: VaultSnapshotService,
    vaultSyncGuard: VaultSyncGuardService,
  ) {
    this.syncProvider = syncProvider;
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultSnapshot = vaultSnapshot;
    this.vaultSyncGuard = vaultSyncGuard;
  }

  async execute(params: SyncUploadCommandParams): Promise<void> {
    const { sourceSnapshotVersionVector, unlockedVault } =
      await this.unlockedVaultSession.requireUnlockedVaultContext(
        params.vaultId,
        "sync upload",
      );
    const syncTarget = unlockedVault.vault.syncTarget;

    if (syncTarget === undefined) {
      throw new SyncNotConfiguredError(params.vaultId, "sync upload");
    }

    if (unlockedVault.vault.syncRemovalPending !== undefined) {
      throw new SyncRemovalPendingError(params.vaultId, "sync upload");
    }

    const localSnapshot =
      await this.vaultSnapshot.requireCurrentSnapshotForUnlockedVault(
        params.vaultId,
        unlockedVault,
        sourceSnapshotVersionVector,
      );
    const syncAccess = await this.vaultSyncGuard.requireSyncAccess(
      params.vaultId,
      unlockedVault,
    );
    const remoteSnapshotDescriptor =
      await this.syncProvider.getLatestVaultSnapshotDescriptor(
        syncAccess,
        params.vaultId,
      );

    if (remoteSnapshotDescriptor !== null) {
      const localSnapshotDescriptor = toVaultSnapshotDescriptor(
        params.vaultId,
        localSnapshot,
      );
      const relation = compareVaultSnapshotDescriptors(
        localSnapshotDescriptor,
        remoteSnapshotDescriptor,
      );

      if (relation === "equal") {
        if (
          !areVaultSnapshotDescriptorsEqual(
            remoteSnapshotDescriptor,
            localSnapshotDescriptor,
          )
        ) {
          throw new RemoteVaultSnapshotIntegrityError(params.vaultId);
        }

        return;
      }

      if (relation === "remote_ahead") {
        throw new RemoteVaultSnapshotAheadError(params.vaultId);
      }

      if (relation === "broken") {
        throw new RemoteVaultSnapshotIntegrityError(params.vaultId);
      }
    }

    try {
      await this.syncProvider.uploadVaultSnapshot(
        syncAccess,
        localSnapshot,
        remoteSnapshotDescriptor,
      );
    } catch (error) {
      if (error instanceof RemoteVaultSnapshotChangedError) {
        throw new SyncConflictDetectedError(params.vaultId);
      }

      throw error;
    }
  }
}
