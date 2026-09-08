import type { ReviewedVaultSnapshotIdentities } from "../../domain/snapshot";
import { areJsonEqual } from "../../domain/common";
import {
  findChangedDeviceProfiles,
  requireDeviceProfilesMatchTrust,
} from "../../domain/sync/device-profile-review.utils";
import { findChangedEntries } from "../../domain/sync/entry-review.utils";
import { findChangesInKeySlots } from "../../domain/sync/key-slot-review.utils";
import type { VaultSyncResolution } from "../../domain/sync/sync-resolution.type";
import {
  applyVaultSyncResolution,
  cloneVaultSyncResolution,
} from "../../domain/sync/sync-resolution.utils";
import { findChangedTags } from "../../domain/sync/tag-review.utils";
import {
  areVaultSnapshotIdentitiesEqual,
  areVaultSnapshotDescriptorsEqual,
  cloneReviewedVaultSnapshotIdentities,
  cloneVaultSnapshotDescriptor,
  compareVaultSnapshotDescriptors,
  toVaultSnapshotIdentity,
} from "../../domain/snapshot/vault-snapshot-descriptor.utils";
import { mergeVersionVectors } from "../../domain/versioning/version-vector.utils";
import type { VersionVector } from "../../domain/versioning/version-vector.type";
import type { Vault } from "../../domain/vault";
import type { SyncUploadStatus } from "../../domain/sync/sync-upload-status.type";
import { clearVaultProviderCredentialRevocationPending } from "../../domain/vault/vault-sync-config.mutations";
import {
  InvalidSyncResolutionError,
  InvalidVaultSyncResolutionError,
  LocalVaultSnapshotAheadError,
  RemoteVaultSnapshotChangedError,
  RemoteVaultSnapshotIntegrityError,
  SyncAlreadyResolvedError,
  SyncNotConfiguredError,
  SyncRemovalPendingError,
  SyncResolutionIncompleteError,
  SyncTrustChangeRequiresDeviceTrustFlowError,
} from "../../errors/sync.errors";
import { LocalVaultSnapshotChangedError } from "../../errors/vault-snapshot.errors";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import type { VaultSyncGuardService } from "../../services/sync";

export type {
  DeviceProfileReviewResolution,
  EntryReviewResolution,
  TagReviewResolution,
  VaultSyncResolution,
} from "../../domain/sync/sync-resolution.type";

export type ApplySyncResolutionCommandParams = {
  readonly vaultId: string;
  readonly reviewedSnapshotIdentities: ReviewedVaultSnapshotIdentities;
  readonly resolution: VaultSyncResolution;
};

export type ApplySyncResolutionResult = {
  readonly snapshotVersionVector: VersionVector;
  readonly revisionTimestamp: number;
  readonly syncUpload: SyncUploadStatus;
};

export class ApplySyncResolutionUseCase {
  private readonly syncProvider: SyncProviderPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultSnapshot: VaultSnapshotService;
  private readonly vaultSyncGuard: VaultSyncGuardService;

  constructor(
    syncProvider: SyncProviderPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultSnapshot: VaultSnapshotService,
    vaultSyncGuard: VaultSyncGuardService,
  ) {
    this.syncProvider = syncProvider;
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultSnapshot = vaultSnapshot;
    this.vaultSyncGuard = vaultSyncGuard;
  }

  async execute(
    params: ApplySyncResolutionCommandParams,
  ): Promise<ApplySyncResolutionResult> {
    const { local: localSnapshotIdentity, remote: remoteSnapshotIdentity } =
      cloneReviewedVaultSnapshotIdentities(params.reviewedSnapshotIdentities);
    const localSnapshotDescriptor = localSnapshotIdentity.descriptor;
    const remoteSnapshotDescriptor = remoteSnapshotIdentity.descriptor;
    const resolution = cloneVaultSyncResolution(params.resolution);
    const { sessionId, sourceSnapshotVersionVector, unlockedVault } =
      await this.unlockedVaultSession.requireUnlockedVaultContext(
        params.vaultId,
        "apply sync resolution",
      );

    if (unlockedVault.vault.syncTarget === undefined) {
      throw new SyncNotConfiguredError(params.vaultId, "apply sync resolution");
    }

    if (unlockedVault.vault.syncRemovalPending !== undefined) {
      throw new SyncRemovalPendingError(
        params.vaultId,
        "apply sync resolution",
      );
    }

    if (
      localSnapshotDescriptor.vaultId !== params.vaultId ||
      remoteSnapshotDescriptor.vaultId !== params.vaultId
    ) {
      throw new InvalidSyncResolutionError(
        params.vaultId,
        new Error("Snapshot descriptor belongs to another vault."),
      );
    }

    const localSnapshot =
      await this.vaultSnapshot.requireCurrentSnapshotForUnlockedVault(
        params.vaultId,
        unlockedVault,
        sourceSnapshotVersionVector,
      );
    const currentLocalSnapshotIdentity = toVaultSnapshotIdentity(
      params.vaultId,
      localSnapshot,
      unlockedVault.trustedSnapshotContext.snapshotDigest,
    );
    const currentLocalSnapshotDescriptor =
      currentLocalSnapshotIdentity.descriptor;

    if (
      !areVaultSnapshotIdentitiesEqual(
        currentLocalSnapshotIdentity,
        localSnapshotIdentity,
      )
    ) {
      throw new LocalVaultSnapshotChangedError(params.vaultId);
    }
    const syncAccess = await this.vaultSyncGuard.requireSyncAccess(
      params.vaultId,
      unlockedVault,
    );
    const currentRemoteDescriptor =
      await this.syncProvider.getLatestVaultSnapshotDescriptor(
        syncAccess,
        params.vaultId,
      );

    if (
      currentRemoteDescriptor === null ||
      !areVaultSnapshotDescriptorsEqual(
        currentRemoteDescriptor,
        remoteSnapshotDescriptor,
      )
    ) {
      throw new RemoteVaultSnapshotChangedError(params.vaultId);
    }

    const relation = compareVaultSnapshotDescriptors(
      currentLocalSnapshotDescriptor,
      remoteSnapshotDescriptor,
    );

    if (relation === "broken") {
      throw new RemoteVaultSnapshotIntegrityError(params.vaultId);
    }

    if (relation === "local_ahead") {
      throw new LocalVaultSnapshotAheadError(params.vaultId);
    }

    const remoteSnapshot = await this.syncProvider.downloadVaultSnapshot(
      syncAccess,
      cloneVaultSnapshotDescriptor(remoteSnapshotDescriptor),
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
        unlockedVault.trustedSnapshotContext.trust.certificateDigest ||
      remoteSnapshot.metadata.vaultKeyGeneration !==
        localSnapshot.metadata.vaultKeyGeneration
    ) {
      throw new SyncTrustChangeRequiresDeviceTrustFlowError(params.vaultId);
    }

    let keySlotsChanged = false;

    try {
      keySlotsChanged = findChangesInKeySlots(
        localSnapshot.keySlots,
        remoteSnapshot.keySlots,
      ).hasChanges;
    } catch (error) {
      throw new SyncTrustChangeRequiresDeviceTrustFlowError(
        params.vaultId,
        error,
      );
    }

    if (
      keySlotsChanged ||
      !areJsonEqual(localSnapshot.keySlots, remoteSnapshot.keySlots)
    ) {
      throw new SyncTrustChangeRequiresDeviceTrustFlowError(params.vaultId);
    }

    const remoteVault = await this.vaultSnapshot.openTrustedVaultSnapshot(
      params.vaultId,
      remoteSnapshot,
      unlockedVault.vaultMasterKey,
    );
    const providerCredentialRevocationCompleted =
      unlockedVault.vault.providerCredentialRevocationPending !== undefined &&
      remoteVault.providerCredentialRevocationPending === undefined;

    if (
      remoteSnapshot.metadata.vaultCreationTimestamp !==
        localSnapshot.metadata.vaultCreationTimestamp ||
      !areJsonEqual(remoteVault.syncTarget, unlockedVault.vault.syncTarget) ||
      !areJsonEqual(
        remoteVault.syncRemovalPending,
        unlockedVault.vault.syncRemovalPending,
      ) ||
      (!areJsonEqual(
        remoteVault.providerCredentialRevocationPending,
        unlockedVault.vault.providerCredentialRevocationPending,
      ) &&
        !providerCredentialRevocationCompleted)
    ) {
      throw new RemoteVaultSnapshotIntegrityError(params.vaultId);
    }

    if (
      !areVaultSnapshotIdentitiesEqual(
        toVaultSnapshotIdentity(
          params.vaultId,
          remoteSnapshot,
          remoteTrust.snapshotDigest,
        ),
        remoteSnapshotIdentity,
      )
    ) {
      throw new RemoteVaultSnapshotChangedError(params.vaultId);
    }

    if (relation === "equal") {
      if (
        !areVaultSnapshotIdentitiesEqual(
          currentLocalSnapshotIdentity,
          remoteSnapshotIdentity,
        )
      ) {
        throw new RemoteVaultSnapshotIntegrityError(params.vaultId);
      }

      throw new SyncAlreadyResolvedError(params.vaultId);
    }

    const trustedDeviceIds = new Set(
      unlockedVault.trustedSnapshotContext.trust.trustedDevices.map(
        (device) => device.deviceId,
      ),
    );
    const historicalDeviceIds = new Set(
      remoteTrust.chain.certificates.flatMap((certificate) =>
        certificate.payload.trustedDevices.map((device) => device.deviceId),
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
      historicalDeviceIds,
    );

    const entryReviews = findChangedEntries(unlockedVault.vault, remoteVault);
    const tagReviews = findChangedTags(unlockedVault.vault, remoteVault);
    const deviceProfileReviews = findChangedDeviceProfiles(
      unlockedVault.vault,
      remoteVault,
    );

    if (
      entryReviews.length !== resolution.entryResolutions.length ||
      tagReviews.length !== resolution.tagResolutions.length ||
      deviceProfileReviews.length !== resolution.deviceProfileResolutions.length
    ) {
      throw new SyncResolutionIncompleteError(params.vaultId);
    }

    let resolvedVault: Vault;

    try {
      resolvedVault = applyVaultSyncResolution(
        unlockedVault.vault,
        remoteVault,
        { entryReviews, tagReviews, deviceProfileReviews },
        resolution,
        unlockedVault.deviceId,
      );
    } catch (error) {
      if (error instanceof InvalidVaultSyncResolutionError) {
        throw new InvalidSyncResolutionError(params.vaultId, error);
      }

      throw error;
    }

    // Validate every choice through the existing domain policy before adopting
    // remote bytes. Accepting the remote state is not a new content mutation.
    const acceptsRemoteState = [
      ...resolution.entryResolutions,
      ...resolution.tagResolutions,
      ...resolution.deviceProfileResolutions,
    ].every((choice) => choice.action === "use_remote");

    if (acceptsRemoteState) {
      const persistedSnapshot =
        await this.unlockedVaultSession.persistForActiveSession(
          sessionId,
          params.vaultId,
          async () => {
            const syncCredentialStateTransition =
              await this.vaultSyncGuard.prepareSyncCredentialStateWithoutPending(
                params.vaultId,
                unlockedVault,
                { discardPendingSnapshotUpload: true },
              );

            return this.vaultSnapshot.persistVerifiedRemoteSnapshot(
              params.vaultId,
              remoteSnapshot,
              remoteTrust.state,
              unlockedVault,
              {
                expectedSyncCredentialState:
                  syncCredentialStateTransition.expectedState,
                syncCredentialState: syncCredentialStateTransition.nextState,
              },
            );
          },
        );

      await this.unlockedVaultSession.commitPersistedSnapshot(
        sessionId,
        {
          ...unlockedVault,
          vault: remoteVault,
          trustedSnapshotContext: persistedSnapshot.trustedSnapshotContext,
        },
        persistedSnapshot.snapshotVersionVector,
      );

      return {
        snapshotVersionVector: {
          ...persistedSnapshot.snapshotVersionVector,
        },
        revisionTimestamp: persistedSnapshot.revisionTimestamp,
        syncUpload: "complete",
      };
    }

    if (providerCredentialRevocationCompleted) {
      resolvedVault =
        clearVaultProviderCredentialRevocationPending(resolvedVault);
    }

    requireDeviceProfilesMatchTrust(
      resolvedVault,
      trustedDeviceIds,
      historicalDeviceIds,
    );

    const updatedUnlockedVault = {
      ...unlockedVault,
      vault: resolvedVault,
    };
    const { persistedSnapshot, preparedRestore, persistedSyncCredentialState } =
      await this.unlockedVaultSession.persistForActiveSession(
        sessionId,
        params.vaultId,
        async () => {
          const preparedRestore =
            await this.vaultSnapshot.prepareLocalVaultSnapshotRestore(
              localSnapshot,
              unlockedVault,
            );
          const syncCredentialStateTransition =
            await this.vaultSyncGuard.prepareSyncCredentialStateWithoutPending(
              params.vaultId,
              unlockedVault,
              { discardPendingSnapshotUpload: true },
            );
          const persistedSnapshot =
            await this.vaultSnapshot.persistUnlockedVault(
              params.vaultId,
              updatedUnlockedVault,
              sourceSnapshotVersionVector,
              {
                baseSnapshotVersionVector: mergeVersionVectors(
                  localSnapshot.metadata.snapshotVersionVector,
                  remoteSnapshotDescriptor.snapshotVersionVector,
                ),
                uploadExpectedRemoteSnapshotIdentity: remoteSnapshotIdentity,
                expectedSyncCredentialState:
                  syncCredentialStateTransition.expectedState,
                syncCredentialState: syncCredentialStateTransition.nextState,
              },
            );

          return {
            persistedSnapshot,
            preparedRestore,
            persistedSyncCredentialState:
              syncCredentialStateTransition.nextState,
          };
        },
      );

    const syncUpload = await this.vaultSyncGuard.uploadPersistedSnapshot({
      vaultId: params.vaultId,
      syncAccess,
      persistedSnapshot: persistedSnapshot.snapshot,
      expectedRemoteSnapshotIdentity: remoteSnapshotIdentity,
      previousSnapshotVersionVector: sourceSnapshotVersionVector,
      persistedSnapshotDigest:
        persistedSnapshot.trustedSnapshotContext.snapshotDigest,
      checkpoint: persistedSnapshot.checkpoint,
      persistedSyncCredentialState,
      unlockedVault: updatedUnlockedVault,
      preparedRestore,
      sessionId,
    });

    await this.unlockedVaultSession.commitPersistedSnapshotIfSessionIsActive(
      sessionId,
      {
        ...updatedUnlockedVault,
        trustedSnapshotContext: persistedSnapshot.trustedSnapshotContext,
      },
      persistedSnapshot.snapshotVersionVector,
    );

    return {
      snapshotVersionVector: {
        ...persistedSnapshot.snapshotVersionVector,
      },
      revisionTimestamp: persistedSnapshot.revisionTimestamp,
      syncUpload,
    };
  }
}
