import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import type { VaultSnapshotDescriptor } from "../../domain/snapshot/vault-snapshot-descriptor.type";
import { areJsonEqual } from "../../domain/common";
import type { VaultSnapshot } from "../../domain/snapshot/vault-snapshot";
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
import { mergeVersionVectors } from "../../domain/versioning/version-vector.utils";
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

type AcceptedCompletedEnrollmentTrustState = {
  readonly keySlots: VaultSnapshot["keySlots"];
  readonly pendingDeviceId: string;
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
    const { vault: remoteVault, completedEnrollmentProof } =
      await this.vaultSnapshot.openTrustedVaultSnapshotWithTrustResult(
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
    let acceptedCompletedEnrollmentTrustState: AcceptedCompletedEnrollmentTrustState | null =
      null;

    if (
      completedEnrollmentProof !== null &&
      completedEnrollmentProof.vaultId === params.vaultId &&
      keySlotsChanges.deviceSlots.addedDeviceIds.length === 1 &&
      keySlotsChanges.deviceSlots.removedDeviceIds.length === 0 &&
      keySlotsChanges.deviceSlots.changedDeviceIds.length === 0
    ) {
      const pendingDeviceId = completedEnrollmentProof.pendingDeviceId;
      const localEnrollmentKeySlot = localSnapshot.keySlots.enrollmentKeySlot;
      const doesLocalEnrollmentSlotMatchCompletedProof =
        localEnrollmentKeySlot !== undefined &&
        localEnrollmentKeySlot.enrollmentId ===
          completedEnrollmentProof.enrollmentId &&
        localEnrollmentKeySlot.pendingDeviceId ===
          completedEnrollmentProof.pendingDeviceId &&
        localEnrollmentKeySlot.pendingDevicePublicSignKeyDigest ===
          completedEnrollmentProof.pendingDevicePublicSignKeyDigest &&
        localEnrollmentKeySlot.protectedVaultMasterKeyDigest ===
          completedEnrollmentProof.protectedVaultMasterKeyDigest &&
        localEnrollmentKeySlot.authorizedByDeviceId ===
          completedEnrollmentProof.authorizedByDeviceId &&
        areJsonEqual(
          localEnrollmentKeySlot.authorizerSignature,
          completedEnrollmentProof.authorizerSignature,
        );
      const doesEnrollmentSlotChangeMatchCompletedProof =
        localEnrollmentKeySlot === undefined
          ? keySlotsChanges.enrollmentKeySlot === "missing"
          : keySlotsChanges.enrollmentKeySlot === "removed" &&
            doesLocalEnrollmentSlotMatchCompletedProof;
      const matchingRemoteDeviceSlots =
        remoteSnapshot.keySlots.deviceSlots.filter(
          (deviceSlot) => deviceSlot.deviceId === pendingDeviceId,
        );

      if (
        keySlotsChanges.deviceSlots.addedDeviceIds[0] === pendingDeviceId &&
        remoteSnapshot.keySlots.enrollmentKeySlot === undefined &&
        doesEnrollmentSlotChangeMatchCompletedProof &&
        matchingRemoteDeviceSlots.length === 1
      ) {
        acceptedCompletedEnrollmentTrustState = {
          keySlots: remoteSnapshot.keySlots,
          pendingDeviceId,
        };
      }
    }

    if (
      keySlotsChanges.hasChanges &&
      acceptedCompletedEnrollmentTrustState === null
    ) {
      throw new SyncTrustChangeRequiresDeviceTrustFlowError(params.vaultId);
    }

    const entryReviews = findChangedEntries(unlockedVault.vault, remoteVault);
    const tagReviews = findChangedTags(unlockedVault.vault, remoteVault);
    const deviceProfileReviews = findChangedDeviceProfiles(
      unlockedVault.vault,
      remoteVault,
    );

    const hasActionableChanges =
      entryReviews.length > 0 ||
      tagReviews.length > 0 ||
      deviceProfileReviews.length > 0;

    if (
      !hasActionableChanges &&
      acceptedCompletedEnrollmentTrustState === null
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

    let resolvedVault = unlockedVault.vault;

    if (hasActionableChanges) {
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
    }

    if (
      acceptedCompletedEnrollmentTrustState !== null &&
      !resolvedVault.deviceProfiles.some(
        (deviceProfile) =>
          deviceProfile.id ===
          acceptedCompletedEnrollmentTrustState.pendingDeviceId,
      )
    ) {
      throw new InvalidSyncResolutionError(
        params.vaultId,
        new Error(
          "Completed enrollment resolution must keep the enrolled device profile.",
        ),
      );
    }

    const updatedUnlockedVault = {
      ...unlockedVault,
      vault: resolvedVault,
    };
    const baseSnapshotVersionVector = mergeVersionVectors(
      localSnapshotDescriptor.snapshotVersionVector,
      params.remoteSnapshotDescriptor.snapshotVersionVector,
    );
    const persistOptions =
      acceptedCompletedEnrollmentTrustState === null
        ? {
            baseSnapshotVersionVector,
          }
        : {
            baseSnapshotVersionVector,
            keySlots: acceptedCompletedEnrollmentTrustState.keySlots,
          };
    const persistedSnapshot = await this.vaultSnapshot.persistUnlockedVault(
      params.vaultId,
      updatedUnlockedVault,
      sourceSnapshotVersionVector,
      persistOptions,
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
      try {
        await this.vaultSnapshot.restoreLocalVaultSnapshot(localSnapshot);
      } catch {
        // Preserve the upload failure as the root cause.
      }

      if (error instanceof RemoteVaultSnapshotChangedError) {
        throw new SyncConflictDetectedError(params.vaultId);
      }

      throw error;
    }

    await this.unlockedVaultSession.commitPersistedSnapshot(
      updatedUnlockedVault,
      persistedSnapshot.snapshotVersionVector,
    );

    return {
      snapshotVersionVector: persistedSnapshot.snapshotVersionVector,
      revisionTimestamp: persistedSnapshot.revisionTimestamp,
    };
  }
}
