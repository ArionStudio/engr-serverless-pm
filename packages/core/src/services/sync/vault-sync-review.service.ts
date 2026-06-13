import type { VaultSnapshot } from "../../domain/snapshot/vault-snapshot";
import type { VaultMasterKey } from "../../domain/snapshot/brand-keys";
import type { RemoteVaultSnapshotDescriptor } from "../../domain/sync/remote-vault-snapshot-descriptor.type";
import type { SyncConfig } from "../../domain/sync/sync-config.type";
import {
  areRemoteVaultSnapshotDescriptorsEqual,
  compareLocalAndRemoteSnapshotDescriptors,
  toRemoteVaultSnapshotDescriptor,
} from "../../domain/sync/vault-snapshot-version.utils";
import type { VersionVectorRelation } from "../../domain/sync/version-vector.type";
import {
  createVaultSyncReview,
  createVaultSyncTrustState,
} from "../../domain/sync/vault-sync-review.utils";
import type { VaultSyncReview } from "../../domain/sync/vault-sync-review.type";
import type { Vault } from "../../domain/vault/vault";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import type { VaultSnapshotService } from "../vault-snapshots/vault-snapshot.service";
import {
  RemoteVaultSnapshotChangedError,
  RemoteVaultSnapshotNotFoundError,
} from "../../errors/sync.errors";

export class VaultSyncReviewService {
  private readonly syncProvider: SyncProviderPort;
  private readonly vaultSnapshot: VaultSnapshotService;

  constructor(
    syncProvider: SyncProviderPort,
    vaultSnapshot: VaultSnapshotService,
  ) {
    this.syncProvider = syncProvider;
    this.vaultSnapshot = vaultSnapshot;
  }

  async prepareReview(params: {
    readonly vaultId: string;
    readonly syncConfig: SyncConfig;
    readonly localVault: Vault;
    readonly vaultMasterKey: VaultMasterKey;
  }): Promise<{
    readonly remoteSnapshotDescriptor: RemoteVaultSnapshotDescriptor;
    readonly relation: VersionVectorRelation;
    readonly review: VaultSyncReview;
  }> {
    const remoteSnapshotDescriptor =
      await this.syncProvider.getLatestVaultSnapshotDescriptor(
        params.syncConfig,
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
      params.localVault,
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
          params.localVault,
          params.localVault,
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
          params.localVault,
          params.localVault,
          createVaultSyncTrustState(localSnapshot),
          createVaultSyncTrustState(localSnapshot),
        ),
      };
    }

    const loadedReview = await this.loadReviewForRemoteDescriptorWithSnapshot(
      {
        ...params,
        remoteSnapshotDescriptor,
      },
      localSnapshot,
    );

    return {
      remoteSnapshotDescriptor,
      relation,
      review: loadedReview.review,
    };
  }

  async loadReviewForRemoteDescriptor(params: {
    readonly vaultId: string;
    readonly syncConfig: SyncConfig;
    readonly remoteSnapshotDescriptor: RemoteVaultSnapshotDescriptor;
    readonly localVault: Vault;
    readonly vaultMasterKey: VaultMasterKey;
  }): Promise<{
    readonly remoteVault: Vault;
    readonly review: VaultSyncReview;
  }> {
    return this.loadReviewForRemoteDescriptorWithSnapshot(
      params,
      await this.vaultSnapshot.requireLocalVaultSnapshot(params.vaultId),
    );
  }

  private async loadReviewForRemoteDescriptorWithSnapshot(
    params: {
      readonly vaultId: string;
      readonly syncConfig: SyncConfig;
      readonly remoteSnapshotDescriptor: RemoteVaultSnapshotDescriptor;
      readonly localVault: Vault;
      readonly vaultMasterKey: VaultMasterKey;
    },
    localSnapshot: VaultSnapshot,
  ): Promise<{
    readonly remoteVault: Vault;
    readonly review: VaultSyncReview;
  }> {
    const remoteSnapshot = await this.syncProvider.downloadVaultSnapshot(
      params.syncConfig,
      params.remoteSnapshotDescriptor,
    );
    const remoteVault = await this.vaultSnapshot.openTrustedVaultSnapshot(
      params.vaultId,
      remoteSnapshot,
      params.vaultMasterKey,
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
        params.remoteSnapshotDescriptor,
      )
    ) {
      throw new RemoteVaultSnapshotChangedError(params.vaultId);
    }

    return {
      remoteVault,
      review: createVaultSyncReview(
        params.localVault,
        remoteVault,
        createVaultSyncTrustState(localSnapshot),
        createVaultSyncTrustState(remoteSnapshot),
      ),
    };
  }
}
