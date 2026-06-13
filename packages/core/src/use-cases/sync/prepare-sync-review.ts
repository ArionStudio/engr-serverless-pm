import type { RemoteVaultSnapshotDescriptor } from "../../domain/sync/remote-vault-snapshot-descriptor.type";
import type { VaultSyncReview } from "../../domain/sync/vault-sync-review.type";
import type { VersionVectorRelation } from "../../domain/sync/version-vector.type";
import {
  areRemoteVaultSnapshotDescriptorsEqual,
  compareLocalAndRemoteSnapshotDescriptors,
  toRemoteVaultSnapshotDescriptor,
} from "../../domain/sync/vault-snapshot-version.utils";
import {
  createVaultSyncReview,
  createVaultSyncTrustState,
} from "../../domain/sync/vault-sync-review.utils";
import {
  RemoteVaultSnapshotChangedError,
  RemoteVaultSnapshotNotFoundError,
  SyncNotConfiguredError,
} from "../../errors/sync.errors";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import type { UnlockedVaultSessionService } from "../../services/vault-session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../services/vault-snapshots/vault-snapshot.service";

export type PrepareSyncReviewCommandParams = {
  readonly vaultId: string;
};

export type PrepareSyncReviewResult = {
  readonly remoteSnapshotDescriptor: RemoteVaultSnapshotDescriptor;
  readonly relation: VersionVectorRelation;
  readonly review: VaultSyncReview;
};

export class PrepareSyncReviewUseCase {
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly syncProvider: SyncProviderPort;
  private readonly vaultSnapshot: VaultSnapshotService;

  constructor(
    unlockedVaultSession: UnlockedVaultSessionService,
    syncProvider: SyncProviderPort,
    vaultSnapshot: VaultSnapshotService,
  ) {
    this.unlockedVaultSession = unlockedVaultSession;
    this.syncProvider = syncProvider;
    this.vaultSnapshot = vaultSnapshot;
  }

  async execute(
    params: PrepareSyncReviewCommandParams,
  ): Promise<PrepareSyncReviewResult> {
    const { unlockedVault } =
      await this.unlockedVaultSession.requireUnlockedVaultContext(
        params.vaultId,
        "prepare sync review",
      );
    const syncConfig = unlockedVault.vault.syncConfig;

    if (syncConfig === undefined) {
      throw new SyncNotConfiguredError(params.vaultId, "prepare sync review");
    }

    const remoteSnapshotDescriptor =
      await this.syncProvider.getLatestVaultSnapshotDescriptor(
        syncConfig,
        params.vaultId,
      );

    if (remoteSnapshotDescriptor === null) {
      throw new RemoteVaultSnapshotNotFoundError(params.vaultId);
    }

    const localSnapshot = await this.vaultSnapshot.requireLocalVaultSnapshot(
      params.vaultId,
    );
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
      relation === "local_ahead" &&
      remoteSnapshotDescriptor.revisionTimestamp <=
        localSnapshot.metadata.revisionTimestamp
    ) {
      return {
        remoteSnapshotDescriptor,
        relation,
        review: createVaultSyncReview(
          unlockedVault.vault,
          unlockedVault.vault,
          createVaultSyncTrustState(localSnapshot),
          createVaultSyncTrustState(localSnapshot),
        ),
      };
    }

    if (
      relation === "equal" &&
      areRemoteVaultSnapshotDescriptorsEqual(
        remoteSnapshotDescriptor,
        localSnapshotDescriptor,
      )
    ) {
      return {
        remoteSnapshotDescriptor,
        relation,
        review: createVaultSyncReview(
          unlockedVault.vault,
          unlockedVault.vault,
          createVaultSyncTrustState(localSnapshot),
          createVaultSyncTrustState(localSnapshot),
        ),
      };
    }

    const remoteSnapshot = await this.syncProvider.downloadVaultSnapshot(
      syncConfig,
      remoteSnapshotDescriptor,
    );
    const remoteVault = await this.vaultSnapshot.openTrustedVaultSnapshot(
      params.vaultId,
      remoteSnapshot,
      unlockedVault.vaultMasterKey,
      localSnapshot,
    );
    const downloadedDescriptor = toRemoteVaultSnapshotDescriptor(
      remoteSnapshot.metadata.id,
      remoteVault,
      remoteSnapshot,
    );

    if (
      !areRemoteVaultSnapshotDescriptorsEqual(
        downloadedDescriptor,
        remoteSnapshotDescriptor,
      )
    ) {
      throw new RemoteVaultSnapshotChangedError(params.vaultId);
    }

    return {
      remoteSnapshotDescriptor,
      relation,
      review: createVaultSyncReview(
        unlockedVault.vault,
        remoteVault,
        createVaultSyncTrustState(localSnapshot),
        createVaultSyncTrustState(remoteSnapshot),
      ),
    };
  }
}
