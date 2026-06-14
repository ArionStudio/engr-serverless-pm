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
} from "../../errors/sync.errors";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";

export type SyncUploadCommandParams = {
  readonly vaultId: string;
};

export class SyncUploadUseCase {
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

  async execute(params: SyncUploadCommandParams): Promise<void> {
    const { unlockedVault } =
      await this.unlockedVaultSession.requireUnlockedVaultContext(
        params.vaultId,
        "sync upload",
      );
    const syncConfig = unlockedVault.vault.syncConfig;

    if (syncConfig === undefined) {
      throw new SyncNotConfiguredError(params.vaultId, "sync upload");
    }

    const localSnapshot = await this.vaultSnapshot.requireLocalVaultSnapshot(
      params.vaultId,
    );
    const remoteSnapshotDescriptor =
      await this.syncProvider.getLatestVaultSnapshotDescriptor(
        syncConfig,
        params.vaultId,
      );

    if (remoteSnapshotDescriptor !== null) {
      const localSnapshotDescriptor = toVaultSnapshotDescriptor(
        localSnapshot.metadata.id,
        unlockedVault.vault,
        localSnapshot,
      );
      const relation = compareVaultSnapshotDescriptors(
        localSnapshotDescriptor,
        remoteSnapshotDescriptor,
      );

      if (
        relation === "equal" &&
        areVaultSnapshotDescriptorsEqual(
          remoteSnapshotDescriptor,
          localSnapshotDescriptor,
        )
      ) {
        return;
      }

      if (relation === "equal") {
        throw new RemoteVaultSnapshotIntegrityError(params.vaultId);
      }

      if (relation === "remote_ahead") {
        throw new RemoteVaultSnapshotAheadError(params.vaultId);
      }

      if (relation === "diverged") {
        throw new SyncConflictDetectedError(params.vaultId);
      }
    }

    try {
      await this.syncProvider.uploadVaultSnapshot(
        syncConfig,
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
