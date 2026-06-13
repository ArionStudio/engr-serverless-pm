import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import type { RemoteVaultSnapshotDescriptor } from "../../domain/sync/remote-vault-snapshot-descriptor.type";
import type { VaultSyncResolution } from "../../domain/sync/vault-sync-review.type";
import { areRemoteVaultSnapshotDescriptorsEqual } from "../../domain/sync/vault-snapshot-version.utils";
import { applyVaultSyncResolution } from "../../domain/sync/vault-sync-review.utils";
import {
  InvalidSyncResolutionError,
  RemoteVaultSnapshotChangedError,
  SyncResolutionIncompleteError,
  SyncTrustChangeRequiresDeviceTrustFlowError,
} from "../../errors/sync.errors";
import { requireVaultSyncConfig } from "../../services/sync/sync-config.utils";
import type { VaultSyncUploadService } from "../../services/sync/vault-sync-upload.service";
import type { VaultSyncReviewService } from "../../services/sync/vault-sync-review.service";
import type { UnlockedVaultSessionService } from "../../services/vault-session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../services/vault-snapshots/vault-snapshot.service";

export type ApplySyncResolutionCommandParams = {
  readonly vaultId: string;
  readonly remoteSnapshotDescriptor: RemoteVaultSnapshotDescriptor;
  readonly resolution: VaultSyncResolution;
};

export type ApplySyncResolutionResult = {
  readonly revision: number;
  readonly revisionTimestamp: number;
  readonly deviceId: string;
};

export class ApplySyncResolutionUseCase {
  private readonly syncProvider: SyncProviderPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultSyncReview: VaultSyncReviewService;
  private readonly vaultSnapshot: VaultSnapshotService;
  private readonly vaultSyncUpload: VaultSyncUploadService;

  constructor(
    syncProvider: SyncProviderPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultSyncReview: VaultSyncReviewService,
    vaultSnapshot: VaultSnapshotService,
    vaultSyncUpload: VaultSyncUploadService,
  ) {
    this.syncProvider = syncProvider;
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultSyncReview = vaultSyncReview;
    this.vaultSnapshot = vaultSnapshot;
    this.vaultSyncUpload = vaultSyncUpload;
  }

  async execute(
    params: ApplySyncResolutionCommandParams,
  ): Promise<ApplySyncResolutionResult> {
    const { sourceSnapshotRevision, unlockedVault } =
      await this.unlockedVaultSession.requireUnlockedVaultContext(
        params.vaultId,
        "apply sync resolution",
      );
    const syncConfig = requireVaultSyncConfig(
      params.vaultId,
      "apply sync resolution",
      unlockedVault.vault,
    );

    if (params.remoteSnapshotDescriptor.vaultId !== params.vaultId) {
      throw new InvalidSyncResolutionError(
        params.vaultId,
        new Error("Remote snapshot descriptor belongs to another vault."),
      );
    }

    const currentRemoteSnapshotDescriptor =
      await this.syncProvider.getLatestVaultSnapshotDescriptor(
        syncConfig,
        params.vaultId,
      );

    if (currentRemoteSnapshotDescriptor === null) {
      throw new RemoteVaultSnapshotChangedError(params.vaultId);
    }

    if (
      !areRemoteVaultSnapshotDescriptorsEqual(
        currentRemoteSnapshotDescriptor,
        params.remoteSnapshotDescriptor,
      )
    ) {
      throw new RemoteVaultSnapshotChangedError(params.vaultId);
    }

    const { remoteVault, review } =
      await this.vaultSyncReview.loadReviewForRemoteDescriptor({
        vaultId: params.vaultId,
        syncConfig,
        remoteSnapshotDescriptor: params.remoteSnapshotDescriptor,
        localVault: unlockedVault.vault,
        vaultMasterKey: unlockedVault.vaultMasterKey,
      });

    if (review.trustReview !== undefined) {
      throw new SyncTrustChangeRequiresDeviceTrustFlowError(params.vaultId);
    }

    if (!review.hasChanges) {
      throw new SyncResolutionIncompleteError(params.vaultId);
    }

    if (
      review.entryReviews.length !==
        params.resolution.entryResolutions.length ||
      review.tagReviews.length !== params.resolution.tagResolutions.length ||
      review.deviceProfileReviews.length !==
        params.resolution.deviceProfileResolutions.length
    ) {
      throw new SyncResolutionIncompleteError(params.vaultId);
    }

    let resolvedVault;

    try {
      resolvedVault = applyVaultSyncResolution(
        unlockedVault.vault,
        remoteVault,
        params.resolution,
        unlockedVault.deviceId,
      );
    } catch (error) {
      throw new InvalidSyncResolutionError(params.vaultId, error);
    }

    const updatedUnlockedVault = {
      ...unlockedVault,
      vault: resolvedVault,
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

    const resolvedSnapshot = await this.vaultSnapshot.requireLocalVaultSnapshot(
      params.vaultId,
    );

    await this.vaultSyncUpload.uploadSnapshotWithExpectedDescriptor({
      vaultId: params.vaultId,
      syncConfig,
      vaultSnapshot: resolvedSnapshot,
      expectedRemoteSnapshotDescriptor: params.remoteSnapshotDescriptor,
    });

    return persistedSnapshot;
  }
}
