import type { VaultSnapshotDescriptor } from "../../domain/snapshot/vault-snapshot-descriptor.type";
import type { VaultSyncReview } from "../../domain/sync/vault-sync-review.type";
import type { VersionVectorRelation } from "../../domain/versioning/version-vector.type";
import {
  areVaultSnapshotDescriptorsEqual,
  compareVaultSnapshotDescriptors,
  toVaultSnapshotDescriptor,
} from "../../domain/snapshot/vault-snapshot-descriptor.utils";
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
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";

export type PrepareSyncReviewCommandParams = {
  readonly vaultId: string;
};

export type PrepareSyncReviewResult = {
  readonly remoteSnapshotDescriptor: VaultSnapshotDescriptor;
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
    const localSnapshotDescriptor = toVaultSnapshotDescriptor(
      params.vaultId,
      unlockedVault.vault,
      localSnapshot,
    );
    const relation = compareVaultSnapshotDescriptors(
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
      areVaultSnapshotDescriptorsEqual(
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
    const downloadedDescriptor = toVaultSnapshotDescriptor(
      params.vaultId,
      remoteVault,
      remoteSnapshot,
    );

    if (
      !areVaultSnapshotDescriptorsEqual(
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
