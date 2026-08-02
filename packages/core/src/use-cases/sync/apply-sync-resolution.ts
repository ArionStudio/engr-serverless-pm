import type { VaultSnapshotDescriptor } from "../../domain/snapshot";
import { areJsonEqual } from "../../domain/common";
import {
  findChangedDeviceProfiles,
  requireDeviceProfilesMatchTrust,
} from "../../domain/sync/device-profile-review.utils";
import { findChangedEntries } from "../../domain/sync/entry-review.utils";
import { findChangesInKeySlots } from "../../domain/sync/key-slot-review.utils";
import type { VaultSyncResolution } from "../../domain/sync/sync-resolution.type";
import { applyVaultSyncResolution } from "../../domain/sync/sync-resolution.utils";
import { findChangedTags } from "../../domain/sync/tag-review.utils";
import {
  areVaultSnapshotDescriptorsEqual,
  cloneVaultSnapshotDescriptor,
  compareVaultSnapshotDescriptors,
  toVaultSnapshotDescriptor,
} from "../../domain/snapshot/vault-snapshot-descriptor.utils";
import { mergeVersionVectors } from "../../domain/versioning/version-vector.utils";
import type { Vault } from "../../domain/vault";
import { clearVaultProviderCredentialRevocationPending } from "../../domain/vault/vault-sync-config.mutations";
import {
  InvalidSyncResolutionError,
  InvalidVaultSyncResolutionError,
  LocalVaultSnapshotAheadError,
  RemoteVaultSnapshotChangedError,
  RemoteVaultSnapshotIntegrityError,
  SyncAlreadyResolvedError,
  SyncConflictDetectedError,
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
  readonly localSnapshotDescriptor: VaultSnapshotDescriptor;
  readonly remoteSnapshotDescriptor: VaultSnapshotDescriptor;
  readonly resolution: VaultSyncResolution;
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

  async execute(params: ApplySyncResolutionCommandParams) {
    const localSnapshotDescriptor = cloneVaultSnapshotDescriptor(
      params.localSnapshotDescriptor,
    );
    const remoteSnapshotDescriptor = cloneVaultSnapshotDescriptor(
      params.remoteSnapshotDescriptor,
    );
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
    const currentLocalSnapshotDescriptor = toVaultSnapshotDescriptor(
      params.vaultId,
      localSnapshot,
    );

    if (
      !areVaultSnapshotDescriptorsEqual(
        currentLocalSnapshotDescriptor,
        localSnapshotDescriptor,
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

    if (relation === "equal") {
      throw new SyncAlreadyResolvedError(params.vaultId);
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
      !areVaultSnapshotDescriptorsEqual(
        toVaultSnapshotDescriptor(params.vaultId, remoteSnapshot),
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
      entryReviews.length === 0 &&
      tagReviews.length === 0 &&
      deviceProfileReviews.length === 0 &&
      !providerCredentialRevocationCompleted
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

    if (
      entryReviews.length === 0 &&
      tagReviews.length === 0 &&
      deviceProfileReviews.length === 0
    ) {
      const persistedSnapshot =
        await this.unlockedVaultSession.persistForActiveSession(
          sessionId,
          params.vaultId,
          async () =>
            this.vaultSnapshot.persistVerifiedRemoteSnapshot(
              params.vaultId,
              remoteSnapshot,
              remoteTrust.state,
              unlockedVault,
            ),
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
      };
    }

    let resolvedVault: Vault;

    try {
      resolvedVault = applyVaultSyncResolution(
        unlockedVault.vault,
        remoteVault,
        { entryReviews, tagReviews, deviceProfileReviews },
        params.resolution,
        unlockedVault.deviceId,
      );
    } catch (error) {
      if (error instanceof InvalidVaultSyncResolutionError) {
        throw new InvalidSyncResolutionError(params.vaultId, error);
      }

      throw error;
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
    const persistedSnapshot =
      await this.unlockedVaultSession.persistForActiveSession(
        sessionId,
        params.vaultId,
        async () =>
          this.vaultSnapshot.persistUnlockedVault(
            params.vaultId,
            updatedUnlockedVault,
            sourceSnapshotVersionVector,
            {
              baseSnapshotVersionVector: mergeVersionVectors(
                localSnapshot.metadata.snapshotVersionVector,
                remoteSnapshotDescriptor.snapshotVersionVector,
              ),
            },
          ),
      );

    try {
      await this.syncProvider.uploadVaultSnapshot(
        syncAccess,
        persistedSnapshot.snapshot,
        cloneVaultSnapshotDescriptor(remoteSnapshotDescriptor),
      );
    } catch (error) {
      await this.unlockedVaultSession.restorePersistedState(
        sessionId,
        params.vaultId,
        async () => {
          await this.vaultSnapshot.restoreLocalVaultSnapshot(
            localSnapshot,
            persistedSnapshot.snapshot,
            unlockedVault,
          );
        },
      );

      if (error instanceof RemoteVaultSnapshotChangedError) {
        throw new SyncConflictDetectedError(params.vaultId);
      }

      throw error;
    }

    await this.unlockedVaultSession.commitPersistedSnapshot(
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
    };
  }
}
