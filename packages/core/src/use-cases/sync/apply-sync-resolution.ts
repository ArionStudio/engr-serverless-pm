import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import type { RemoteVaultSnapshotDescriptor } from "../../domain/sync/remote-vault-snapshot-descriptor.type";
import type { VaultSyncResolution } from "../../domain/sync/vault-sync-review.type";
import {
  areRemoteVaultSnapshotDescriptorsEqual,
  toRemoteVaultSnapshotDescriptor,
} from "../../domain/sync/vault-snapshot-version.utils";
import {
  applyVaultSyncResolution,
  createVaultSyncReview,
  createVaultSyncTrustState,
} from "../../domain/sync/vault-sync-review.utils";
import {
  InvalidSyncResolutionError,
  InvalidVaultSyncResolutionError,
  RemoteVaultSnapshotChangedError,
  SyncConflictDetectedError,
  SyncAlreadyResolvedError,
  SyncNotConfiguredError,
  SyncResolutionIncompleteError,
  SyncTrustChangeRequiresDeviceTrustFlowError,
} from "../../errors/sync.errors";
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

  async execute(
    params: ApplySyncResolutionCommandParams,
  ): Promise<ApplySyncResolutionResult> {
    const { sourceSnapshotRevision, unlockedVault } =
      await this.unlockedVaultSession.requireUnlockedVaultContext(
        params.vaultId,
        "apply sync resolution",
      );
    const syncConfig = unlockedVault.vault.syncConfig;

    if (syncConfig === undefined) {
      throw new SyncNotConfiguredError(params.vaultId, "apply sync resolution");
    }

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

    const localSnapshot = await this.vaultSnapshot.requireLocalVaultSnapshot(
      params.vaultId,
    );
    const remoteSnapshot = await this.syncProvider.downloadVaultSnapshot(
      syncConfig,
      params.remoteSnapshotDescriptor,
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
        params.remoteSnapshotDescriptor,
      )
    ) {
      throw new RemoteVaultSnapshotChangedError(params.vaultId);
    }

    const review = createVaultSyncReview(
      unlockedVault.vault,
      remoteVault,
      createVaultSyncTrustState(localSnapshot),
      createVaultSyncTrustState(remoteSnapshot),
    );

    if (review.trustReview !== undefined) {
      throw new SyncTrustChangeRequiresDeviceTrustFlowError(params.vaultId);
    }

    if (!review.hasChanges) {
      throw new SyncAlreadyResolvedError(params.vaultId);
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
      if (error instanceof InvalidVaultSyncResolutionError) {
        throw new InvalidSyncResolutionError(params.vaultId, error);
      }

      throw error;
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

    try {
      await this.syncProvider.uploadVaultSnapshot(
        syncConfig,
        resolvedSnapshot,
        params.remoteSnapshotDescriptor,
      );
    } catch (error) {
      if (error instanceof RemoteVaultSnapshotChangedError) {
        throw new SyncConflictDetectedError(params.vaultId);
      }

      throw error;
    }

    return persistedSnapshot;
  }
}
