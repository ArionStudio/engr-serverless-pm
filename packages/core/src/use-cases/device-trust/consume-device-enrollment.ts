import type { VerifiedVaultTrustState } from "../../domain/device-trust";
import type { UnlockedVault } from "../../domain/session";
import { findChangedDeviceProfiles } from "../../domain/sync/device-profile-review.utils";
import { findChangedEntries } from "../../domain/sync/entry-review.utils";
import type { VaultSyncResolution } from "../../domain/sync/sync-resolution.type";
import {
  applyVaultSyncResolution,
  cloneVaultSyncResolution,
} from "../../domain/sync/sync-resolution.utils";
import { findChangedTags } from "../../domain/sync/tag-review.utils";
import type {
  ReviewedVaultSnapshotIdentities,
  VaultSnapshot,
} from "../../domain/snapshot";
import {
  cloneReviewedVaultSnapshotIdentities,
  cloneVaultSnapshotDescriptor,
} from "../../domain/snapshot";
import type { Vault } from "../../domain/vault";
import { mergeVersionVectors } from "../../domain/versioning";
import {
  InvalidSyncResolutionError,
  InvalidVaultSyncResolutionError,
  SyncResolutionIncompleteError,
} from "../../errors/sync.errors";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import type { VaultSyncGuardService } from "../../services/sync";
import { DeviceEnrollmentConsumptionService } from "../../services/trust/device-enrollment-consumption.service";
import { VaultTrustService } from "../../services/trust/vault-trust.service";
import type { SyncUploadStatus } from "../../domain/sync/sync-upload-status.type";

export type ConsumeDeviceEnrollmentCommandParams = {
  readonly vaultId: string;
  readonly reviewedSnapshotIdentities: ReviewedVaultSnapshotIdentities;
  readonly resolution: VaultSyncResolution;
};

export type ConsumeDeviceEnrollmentResult = {
  readonly enrolledDeviceIds: readonly string[];
  readonly vaultKeyGeneration: number;
  readonly syncUpload: SyncUploadStatus;
};

export class ConsumeDeviceEnrollmentUseCase {
  private readonly crypto: CryptoPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultSnapshot: VaultSnapshotService;
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;
  private readonly vaultSyncGuard: VaultSyncGuardService;
  private readonly enrollmentConsumption: DeviceEnrollmentConsumptionService;
  private readonly vaultTrust: VaultTrustService;

  constructor(
    crypto: CryptoPort,
    syncProvider: SyncProviderPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultSnapshot: VaultSnapshotService,
    vaultLocalRepository: VaultLocalRepositoryPort,
    vaultSyncGuard: VaultSyncGuardService,
  ) {
    this.crypto = crypto;
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultSnapshot = vaultSnapshot;
    this.vaultLocalRepository = vaultLocalRepository;
    this.vaultSyncGuard = vaultSyncGuard;
    this.enrollmentConsumption = new DeviceEnrollmentConsumptionService(
      crypto,
      syncProvider,
      vaultSnapshot,
      vaultSyncGuard,
    );
    this.vaultTrust = new VaultTrustService(crypto);
  }

  async execute(
    params: ConsumeDeviceEnrollmentCommandParams,
  ): Promise<ConsumeDeviceEnrollmentResult> {
    const reviewedSnapshotIdentities = cloneReviewedVaultSnapshotIdentities(
      params.reviewedSnapshotIdentities,
    );
    const resolution = cloneVaultSyncResolution(params.resolution);
    if (
      reviewedSnapshotIdentities.local.descriptor.vaultId !== params.vaultId ||
      reviewedSnapshotIdentities.remote.descriptor.vaultId !== params.vaultId
    ) {
      throw new InvalidSyncResolutionError(
        params.vaultId,
        new Error("Snapshot descriptor belongs to another vault."),
      );
    }

    const { sessionId, sourceSnapshotVersionVector, unlockedVault } =
      await this.unlockedVaultSession.requireUnlockedVaultContext(
        params.vaultId,
        "consume device enrollment",
      );
    const candidate = await this.enrollmentConsumption.loadVerifiedCandidate({
      vaultId: params.vaultId,
      operation: "consume device enrollment",
      unlockedVault,
      sourceSnapshotVersionVector,
      reviewedSnapshotIdentities,
    });
    const entryReviews = findChangedEntries(
      candidate.enrollmentBaseline,
      candidate.remoteVault,
    );
    const tagReviews = findChangedTags(
      candidate.enrollmentBaseline,
      candidate.remoteVault,
    );
    const deviceProfileReviews = findChangedDeviceProfiles(
      candidate.enrollmentBaseline,
      candidate.remoteVault,
    );

    if (
      entryReviews.length !== resolution.entryResolutions.length ||
      tagReviews.length !== resolution.tagResolutions.length ||
      deviceProfileReviews.length !== resolution.deviceProfileResolutions.length
    ) {
      throw new SyncResolutionIncompleteError(params.vaultId);
    }

    const hasContentChanges =
      entryReviews.length > 0 ||
      tagReviews.length > 0 ||
      deviceProfileReviews.length > 0;
    let syncUpload: SyncUploadStatus = "complete";

    if (!hasContentChanges) {
      await this.persistRemoteSnapshot(
        sessionId,
        unlockedVault,
        candidate.remoteSnapshot,
        candidate.remoteTrust.state,
        candidate.remoteVault,
      );
    } else {
      let resolvedVault: Vault;

      try {
        resolvedVault = applyVaultSyncResolution(
          candidate.enrollmentBaseline,
          candidate.remoteVault,
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

      const updatedUnlockedVault = {
        ...unlockedVault,
        vault: resolvedVault,
      };
      const {
        persistedSnapshot,
        preparedRestore,
        persistedSyncCredentialState,
      } = await this.unlockedVaultSession.persistForActiveSession(
        sessionId,
        params.vaultId,
        async () => {
          const preparedRestore =
            await this.vaultSnapshot.prepareLocalVaultSnapshotRestore(
              candidate.localSnapshot,
              unlockedVault,
            );
          const syncCredentialStateTransition =
            await this.vaultSyncGuard.prepareSyncCredentialStateWithoutPending(
              params.vaultId,
              unlockedVault,
              { allowPendingSnapshotUpload: true },
            );
          const persistedSnapshot =
            await this.vaultSnapshot.persistUnlockedVault(
              params.vaultId,
              updatedUnlockedVault,
              sourceSnapshotVersionVector,
              {
                baseSnapshotVersionVector: mergeVersionVectors(
                  candidate.localSnapshot.metadata.snapshotVersionVector,
                  candidate.remoteSnapshot.metadata.snapshotVersionVector,
                ),
                keySlots: candidate.remoteSnapshot.keySlots,
                vaultKeyGeneration:
                  candidate.remoteSnapshot.metadata.vaultKeyGeneration,
                nextTrust: candidate.remoteTrust,
                uploadExpectedRemoteSnapshotIdentity: {
                  descriptor: candidate.remoteSnapshotDescriptor,
                  snapshotDigest: candidate.remoteTrust.snapshotDigest,
                },
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

      syncUpload = await this.vaultSyncGuard.uploadPersistedLocalMutation(
        params.vaultId,
        {
          localSnapshot: candidate.localSnapshot,
          syncAccess: candidate.syncAccess,
          syncCredentialState: persistedSyncCredentialState,
          remoteSnapshotIdentity: {
            descriptor: cloneVaultSnapshotDescriptor(
              candidate.remoteSnapshotDescriptor,
            ),
            snapshotDigest: candidate.remoteTrust.snapshotDigest,
          },
        },
        persistedSnapshot.snapshot,
        persistedSnapshot.trustedSnapshotContext.snapshotDigest,
        persistedSnapshot.checkpoint,
        updatedUnlockedVault,
        preparedRestore,
        sessionId,
      );

      await this.unlockedVaultSession.commitPersistedSnapshotIfSessionIsActive(
        sessionId,
        {
          ...updatedUnlockedVault,
          trustedSnapshotContext: persistedSnapshot.trustedSnapshotContext,
        },
        persistedSnapshot.snapshotVersionVector,
      );
    }

    return {
      enrolledDeviceIds: candidate.transitions.map(
        (transition) => transition.enrolledDeviceId,
      ),
      vaultKeyGeneration: candidate.remoteSnapshot.metadata.vaultKeyGeneration,
      syncUpload,
    };
  }

  private async persistRemoteSnapshot(
    sessionId: string,
    unlockedVault: UnlockedVault,
    remoteSnapshot: VaultSnapshot,
    remoteTrust: VerifiedVaultTrustState,
    remoteVault: Vault,
  ): Promise<void> {
    const snapshotDigest =
      await this.crypto.digestVaultSnapshot(remoteSnapshot);
    const checkpoint = await this.vaultTrust.createCheckpoint(
      remoteSnapshot,
      remoteTrust,
      unlockedVault.deviceId,
      unlockedVault.devicePrivateSignKey,
    );
    const currentSnapshot = await this.vaultSnapshot.requireLocalVaultSnapshot(
      unlockedVault.vaultId,
    );
    const expectedCheckpoint =
      await this.vaultSnapshot.requireCurrentCheckpointForUnlockedVault(
        unlockedVault.vaultId,
        currentSnapshot,
        unlockedVault,
      );

    await this.unlockedVaultSession.persistForActiveSession(
      sessionId,
      unlockedVault.vaultId,
      async () => {
        const syncCredentialStateTransition =
          await this.vaultSyncGuard.prepareSyncCredentialStateWithoutPending(
            unlockedVault.vaultId,
            unlockedVault,
            { allowPendingSnapshotUpload: true },
          );

        await this.vaultLocalRepository.saveVaultSnapshotWithCheckpoint({
          expectedSnapshotDigest:
            unlockedVault.trustedSnapshotContext.snapshotDigest,
          expectedCheckpoint,
          expectedSyncCredentialState:
            syncCredentialStateTransition.expectedState,
          snapshot: remoteSnapshot,
          checkpoint,
          syncCredentialState: syncCredentialStateTransition.nextState,
        });
      },
    );

    await this.unlockedVaultSession.commitPersistedSnapshot(
      sessionId,
      {
        ...unlockedVault,
        vault: remoteVault,
        trustedSnapshotContext: {
          snapshotDigest,
          trust: remoteTrust,
        },
      },
      remoteSnapshot.metadata.snapshotVersionVector,
    );
  }
}
