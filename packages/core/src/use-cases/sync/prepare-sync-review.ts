import type { VaultSnapshotDescriptor } from "../../domain/snapshot/vault-snapshot-descriptor.type";
import type { VersionVectorRelation } from "../../domain/versioning/version-vector.type";
import {
  areVaultSnapshotDescriptorsEqual,
  compareVaultSnapshotDescriptors,
  toVaultSnapshotDescriptor,
} from "../../domain/snapshot/vault-snapshot-descriptor.utils";

import {
  ChangedDeviceKeySlotsError,
  LocalVaultSnapshotAheadError,
  RemoteVaultSnapshotChangedError,
  RemoteVaultSnapshotIntegrityError,
  RemoteVaultSnapshotNotFoundError,
  SyncNotConfiguredError,
  SyncRemovalPendingError,
  SyncTrustChangeRequiresDeviceTrustFlowError,
} from "../../errors/sync.errors";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import { findChangedEntries } from "../../domain/sync/entry-review.utils";
import type { EntryReviewItem } from "../../domain/sync/entry-review.type";
import { findChangedTags } from "../../domain/sync/tag-review.utils";
import type { TagReviewItem } from "../../domain/sync/tag-review.type";
import {
  findChangedDeviceProfiles,
  requireDeviceProfilesMatchTrust,
} from "../../domain/sync/device-profile-review.utils";
import type { DeviceProfileReviewItem } from "../../domain/sync/device-profile-review.type";
import { findChangesInKeySlots } from "../../domain/sync/key-slot-review.utils";
import type { KeySlotReviewItem } from "../../domain/sync/key-slot-review.type";
import type { VaultSyncGuardService } from "../../services/sync";

export type PrepareSyncReviewCommandParams = {
  readonly vaultId: string;
};

export type PrepareSyncReviewResult = {
  readonly remoteSnapshotDescriptor: VaultSnapshotDescriptor;
  readonly relation: VersionVectorRelation;
  readonly review: VaultSyncReview | null;
};

type VaultSyncReview = {
  readonly actionable: {
    readonly entryReviews: readonly EntryReviewItem[];
    readonly tagReviews: readonly TagReviewItem[];
    readonly deviceProfileReviews: readonly DeviceProfileReviewItem[];
  };
  readonly readOnly: {
    readonly keySlotsChanges: KeySlotReviewItem;
  };
};

export class PrepareSyncReviewUseCase {
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly syncProvider: SyncProviderPort;
  private readonly vaultSnapshot: VaultSnapshotService;
  private readonly vaultSyncGuard: VaultSyncGuardService;

  constructor(
    unlockedVaultSession: UnlockedVaultSessionService,
    syncProvider: SyncProviderPort,
    vaultSnapshot: VaultSnapshotService,
    vaultSyncGuard: VaultSyncGuardService,
  ) {
    this.unlockedVaultSession = unlockedVaultSession;
    this.syncProvider = syncProvider;
    this.vaultSnapshot = vaultSnapshot;
    this.vaultSyncGuard = vaultSyncGuard;
  }

  async execute(
    params: PrepareSyncReviewCommandParams,
  ): Promise<PrepareSyncReviewResult> {
    const { sourceSnapshotVersionVector, unlockedVault } =
      await this.unlockedVaultSession.requireUnlockedVaultContext(
        params.vaultId,
        "prepare sync review",
      );
    const syncTarget = unlockedVault.vault.syncTarget;

    if (syncTarget === undefined) {
      throw new SyncNotConfiguredError(params.vaultId, "prepare sync review");
    }

    if (unlockedVault.vault.syncRemovalPending === true) {
      throw new SyncRemovalPendingError(params.vaultId, "prepare sync review");
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

    if (remoteSnapshotDescriptor === null) {
      throw new RemoteVaultSnapshotNotFoundError(params.vaultId);
    }

    const localSnapshotDescriptor = toVaultSnapshotDescriptor(
      params.vaultId,
      localSnapshot,
    );
    const relation = compareVaultSnapshotDescriptors(
      localSnapshotDescriptor,
      remoteSnapshotDescriptor,
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
          remoteSnapshotDescriptor,
          localSnapshotDescriptor,
        )
      ) {
        throw new RemoteVaultSnapshotIntegrityError(params.vaultId);
      }

      return {
        remoteSnapshotDescriptor,
        relation,
        review: null,
      };
    }

    const remoteSnapshot = await this.syncProvider.downloadVaultSnapshot(
      syncAccess,
      remoteSnapshotDescriptor,
    );
    const remoteTrust = await this.vaultSnapshot.verifyCandidateSnapshotTrust(
      params.vaultId,
      remoteSnapshot,
      unlockedVault,
    );

    if (
      remoteTrust.state.generation !==
        unlockedVault.trustedSnapshotContext.trust.generation ||
      remoteTrust.state.certificateDigest !==
        unlockedVault.trustedSnapshotContext.trust.certificateDigest
    ) {
      throw new SyncTrustChangeRequiresDeviceTrustFlowError(params.vaultId);
    }

    let keySlotsChanges: KeySlotReviewItem;

    try {
      keySlotsChanges = findChangesInKeySlots(
        localSnapshot.keySlots,
        remoteSnapshot.keySlots,
      );
    } catch (error) {
      if (error instanceof ChangedDeviceKeySlotsError) {
        throw new SyncTrustChangeRequiresDeviceTrustFlowError(
          params.vaultId,
          error,
        );
      }

      throw error;
    }

    if (
      keySlotsChanges.hasChanges ||
      remoteSnapshot.metadata.vaultKeyGeneration !==
        localSnapshot.metadata.vaultKeyGeneration
    ) {
      throw new SyncTrustChangeRequiresDeviceTrustFlowError(params.vaultId);
    }

    const remoteVault = await this.vaultSnapshot.openTrustedVaultSnapshot(
      params.vaultId,
      remoteSnapshot,
      unlockedVault.vaultMasterKey,
    );
    const downloadedDescriptor = toVaultSnapshotDescriptor(
      params.vaultId,
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

    const trustedDeviceIds = new Set(
      unlockedVault.trustedSnapshotContext.trust.trustedDevices.map(
        (device) => device.deviceId,
      ),
    );
    requireDeviceProfilesMatchTrust(
      unlockedVault.vault,
      trustedDeviceIds,
      new Set(
        localSnapshot.trustChain.certificates.flatMap((certificate) =>
          certificate.payload.trustedDevices.map((device) => device.deviceId),
        ),
      ),
    );
    requireDeviceProfilesMatchTrust(
      remoteVault,
      trustedDeviceIds,
      new Set(
        remoteTrust.chain.certificates.flatMap((certificate) =>
          certificate.payload.trustedDevices.map((device) => device.deviceId),
        ),
      ),
    );

    const deviceProfileReviews = findChangedDeviceProfiles(
      unlockedVault.vault,
      remoteVault,
    );

    return {
      remoteSnapshotDescriptor,
      relation,
      review: {
        actionable: {
          entryReviews: findChangedEntries(unlockedVault.vault, remoteVault),
          tagReviews: findChangedTags(unlockedVault.vault, remoteVault),
          deviceProfileReviews,
        },
        readOnly: {
          keySlotsChanges,
        },
      },
    };
  }
}
