import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import type { VaultSnapshotDescriptor } from "../../domain/snapshot/vault-snapshot-descriptor.type";
import {
  areVaultSnapshotDescriptorsEqual,
  compareVaultSnapshotDescriptors,
  toVaultSnapshotDescriptor,
} from "../../domain/snapshot/vault-snapshot-descriptor.utils";
import {
  InvalidSyncResolutionError,
  InvalidVaultSyncResolutionError,
  LocalVaultSnapshotAheadError,
  RemoteVaultSnapshotChangedError,
  RemoteVaultSnapshotIntegrityError,
  SyncConflictDetectedError,
  SyncAlreadyResolvedError,
  SyncNotConfiguredError,
  SyncResolutionIncompleteError,
  SyncTrustChangeRequiresDeviceTrustFlowError,
} from "../../errors/sync.errors";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import type { VersionVector } from "../../domain/versioning/version-vector.type";
import { findChangedEntries } from "../../domain/sync/entry-review.utils";
import { findChangedTags } from "../../domain/sync/tag-review.utils";
import { findChangedDeviceProfiles } from "../../domain/sync/device-profile-review.utils";
import { findChangesInKeySlots } from "../../domain/sync/key-slot-review.utils";
import type { VaultSyncResolution } from "../../domain/sync/sync-resolution.type";
import { applyVaultSyncResolution } from "../../domain/sync/sync-resolution.utils";

export type {
  DeviceProfileReviewResolution,
  EntryReviewResolution,
  TagReviewResolution,
  VaultSyncResolution,
} from "../../domain/sync/sync-resolution.type";

export type ApplySyncResolutionCommandParams = {
  readonly vaultId: string;
  readonly remoteSnapshotDescriptor: VaultSnapshotDescriptor;
  readonly resolution: VaultSyncResolution;
};

export type ApplySyncResolutionResult = {
  readonly snapshotVersionVector: VersionVector;
  readonly revisionTimestamp: number;
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
    const { sourceSnapshotVersionVector, unlockedVault } =
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

    const localSnapshot =
      await this.vaultSnapshot.requireCurrentSnapshotForUnlockedVault(
        params.vaultId,
        unlockedVault,
        sourceSnapshotVersionVector,
      );
    const localSnapshotDescriptor = toVaultSnapshotDescriptor(
      params.vaultId,
      localSnapshot,
    );
    const currentRemoteSnapshotDescriptor =
      await this.syncProvider.getLatestVaultSnapshotDescriptor(
        syncConfig,
        params.vaultId,
      );

    if (currentRemoteSnapshotDescriptor === null) {
      throw new RemoteVaultSnapshotChangedError(params.vaultId);
    }

    if (
      !areVaultSnapshotDescriptorsEqual(
        currentRemoteSnapshotDescriptor,
        params.remoteSnapshotDescriptor,
      )
    ) {
      throw new RemoteVaultSnapshotChangedError(params.vaultId);
    }

    const relation = compareVaultSnapshotDescriptors(
      localSnapshotDescriptor,
      params.remoteSnapshotDescriptor,
    );

    if (relation === "broken") {
      throw new RemoteVaultSnapshotIntegrityError(params.vaultId);
    }

    if (relation === "local_ahead") {
      throw new LocalVaultSnapshotAheadError(params.vaultId);
    }

    if (relation === "equal") {
      if (
        !areVaultSnapshotDescriptorsEqual(
          params.remoteSnapshotDescriptor,
          localSnapshotDescriptor,
        )
      ) {
        throw new RemoteVaultSnapshotIntegrityError(params.vaultId);
      }

      throw new SyncAlreadyResolvedError(params.vaultId);
    }

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
    const downloadedDescriptor = toVaultSnapshotDescriptor(
      params.vaultId,
      remoteSnapshot,
    );

    if (
      !areVaultSnapshotDescriptorsEqual(
        downloadedDescriptor,
        params.remoteSnapshotDescriptor,
      )
    ) {
      throw new RemoteVaultSnapshotChangedError(params.vaultId);
    }

    const keySlotsChanges = findChangesInKeySlots(
      localSnapshot.keySlots,
      remoteSnapshot.keySlots,
    );

    if (keySlotsChanges.hasChanges) {
      throw new SyncTrustChangeRequiresDeviceTrustFlowError(params.vaultId);
    }

    const entryReviews = findChangedEntries(unlockedVault.vault, remoteVault);
    const tagReviews = findChangedTags(unlockedVault.vault, remoteVault);
    const deviceProfileReviews = findChangedDeviceProfiles(
      unlockedVault.vault,
      remoteVault,
    );

    if (
      entryReviews.length === 0 &&
      tagReviews.length === 0 &&
      deviceProfileReviews.length === 0
    ) {
      throw new SyncAlreadyResolvedError(params.vaultId);
    }

    if (
      entryReviews.length !== params.resolution.entryResolutions.length ||
      tagReviews.length !== params.resolution.tagResolutions.length ||
      deviceProfileReviews.length !==
        params.resolution.deviceProfileResolutions.length
    ) {
      throw new SyncResolutionIncompleteError(params.vaultId);
    }

    let resolvedVault;

    try {
      resolvedVault = applyVaultSyncResolution(
        unlockedVault.vault,
        remoteVault,
        {
          entryReviews,
          tagReviews,
          deviceProfileReviews,
        },
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
      sourceSnapshotVersionVector,
    );

    await this.unlockedVaultSession.commitPersistedSnapshot(
      updatedUnlockedVault,
      persistedSnapshot.snapshotVersionVector,
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

    return {
      snapshotVersionVector: persistedSnapshot.snapshotVersionVector,
      revisionTimestamp: persistedSnapshot.revisionTimestamp,
    };
  }
}
