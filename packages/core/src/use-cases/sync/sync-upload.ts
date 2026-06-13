import {
  areRemoteVaultSnapshotDescriptorsEqual,
  compareLocalAndRemoteSnapshotDescriptors,
  toRemoteVaultSnapshotDescriptor,
} from "../../domain/sync/vault-snapshot-version.utils";
import {
  RemoteVaultSnapshotAheadError,
  RemoteVaultSnapshotChangedError,
  SyncConflictDetectedError,
} from "../../errors/sync.errors";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import type { UnlockedVaultSessionService } from "../../services/vault-session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../services/vault-snapshots/vault-snapshot.service";
import { requireVaultSyncConfig } from "./require-vault-sync-config";

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
    const syncConfig = requireVaultSyncConfig(
      params.vaultId,
      "sync upload",
      unlockedVault.vault,
    );

    const localSnapshot = await this.vaultSnapshot.requireLocalVaultSnapshot(
      params.vaultId,
    );
    const remoteSnapshotDescriptor =
      await this.syncProvider.getLatestVaultSnapshotDescriptor(
        syncConfig,
        params.vaultId,
      );

    if (remoteSnapshotDescriptor !== null) {
      const localSnapshotDescriptor = toRemoteVaultSnapshotDescriptor(
        localSnapshot.metadata.id,
        unlockedVault.vault,
        localSnapshot,
      );
      const relation = compareLocalAndRemoteSnapshotDescriptors(
        localSnapshotDescriptor,
        remoteSnapshotDescriptor,
      );

      if (
        relation === "equal" &&
        areRemoteVaultSnapshotDescriptorsEqual(
          remoteSnapshotDescriptor,
          localSnapshotDescriptor,
        )
      ) {
        return;
      }

      if (relation === "equal" || relation === "remote_ahead") {
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
