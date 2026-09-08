import type {
  VerifiedVaultTrustState,
  VaultTrustChain,
} from "../../domain/device-trust";
import type { UnlockedVault } from "../../domain/session";
import { findChangedDeviceProfiles } from "../../domain/sync/device-profile-review.utils";
import { findChangedEntries } from "../../domain/sync/entry-review.utils";
import type {
  EncryptedDeviceSyncCredentialState,
  SyncAccess,
  SyncSetupInput,
} from "../../domain/sync";
import type { VaultSyncResolution } from "../../domain/sync/sync-resolution.type";
import {
  applyVaultSyncResolution,
  cloneVaultSyncResolution,
} from "../../domain/sync/sync-resolution.utils";
import { findChangedTags } from "../../domain/sync/tag-review.utils";
import { findChangedFolders } from "../../domain/sync/folder-review.utils";
import type {
  ReviewedVaultSnapshotIdentities,
  VaultMasterKey,
  VaultSnapshot,
  VaultSnapshotDescriptor,
} from "../../domain/snapshot";
import {
  cloneReviewedVaultSnapshotIdentities,
  cloneVaultSnapshotDescriptor,
} from "../../domain/snapshot";
import type { Vault } from "../../domain/vault";
import type { VersionVector } from "../../domain/versioning";
import type { SyncUploadStatus } from "../../domain/sync/sync-upload-status.type";
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
import { DeviceRevocationConsumptionService } from "../../services/trust/device-revocation-consumption.service";
import { VaultTrustService } from "../../services/trust/vault-trust.service";
import { bestEffortWipeArrayBuffers } from "../../lib/secure-wipe.utils";
import { VaultSyncGuardService } from "../../services/sync/vault-sync-guard.service";

export type ConsumeDeviceRevocationCommandParams = {
  readonly vaultId: string;
  readonly replacementSyncConfig: SyncSetupInput;
  readonly reviewedSnapshotIdentities: ReviewedVaultSnapshotIdentities;
  readonly resolution: VaultSyncResolution;
};

export type ConsumeDeviceRevocationResult = {
  readonly revokedDeviceIds: readonly string[];
  readonly enrolledDeviceIds: readonly string[];
  readonly vaultKeyGeneration: number;
  readonly providerCredentialRevocation: "pending_external_deletion";
  readonly syncUpload: SyncUploadStatus;
};

export class ConsumeDeviceRevocationUseCase {
  private readonly crypto: CryptoPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultSnapshot: VaultSnapshotService;
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;
  private readonly revocationConsumption: DeviceRevocationConsumptionService;
  private readonly vaultTrust: VaultTrustService;
  private readonly vaultSyncGuard: VaultSyncGuardService;

  constructor(
    crypto: CryptoPort,
    syncProvider: SyncProviderPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultSnapshot: VaultSnapshotService,
    vaultLocalRepository: VaultLocalRepositoryPort,
  ) {
    this.crypto = crypto;
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultSnapshot = vaultSnapshot;
    this.vaultLocalRepository = vaultLocalRepository;
    this.revocationConsumption = new DeviceRevocationConsumptionService(
      crypto,
      syncProvider,
      vaultSnapshot,
      vaultLocalRepository,
    );
    this.vaultTrust = new VaultTrustService(crypto);
    this.vaultSyncGuard = new VaultSyncGuardService(
      syncProvider,
      vaultSnapshot,
      unlockedVaultSession,
      crypto,
      vaultLocalRepository,
    );
  }

  async execute(
    params: ConsumeDeviceRevocationCommandParams,
  ): Promise<ConsumeDeviceRevocationResult> {
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
        "consume device revocation",
      );
    const candidate = await this.revocationConsumption.loadVerifiedCandidate({
      vaultId: params.vaultId,
      replacementSyncConfig: params.replacementSyncConfig,
      unlockedVault,
      sourceSnapshotVersionVector,
      reviewedSnapshotIdentities,
    });
    let vaultMasterKeyTransferred = false;

    try {
      const entryReviews = findChangedEntries(
        candidate.trustTransitionBaseline,
        candidate.remoteVault,
      );
      const tagReviews = findChangedTags(
        candidate.trustTransitionBaseline,
        candidate.remoteVault,
      );
      const folderReviews = findChangedFolders(
        candidate.trustTransitionBaseline,
        candidate.remoteVault,
      );
      const deviceProfileReviews = findChangedDeviceProfiles(
        candidate.trustTransitionBaseline,
        candidate.remoteVault,
      );

      if (
        entryReviews.length !== resolution.entryResolutions.length ||
        tagReviews.length !== resolution.tagResolutions.length ||
        folderReviews.length !== resolution.folderResolutions.length ||
        deviceProfileReviews.length !==
          resolution.deviceProfileResolutions.length
      ) {
        throw new SyncResolutionIncompleteError(params.vaultId);
      }

      const revokedDeviceIds = candidate.revocations.map(
        (transition) => transition.revokedDeviceId,
      );
      const enrolledDeviceIds = candidate.enrollments.map(
        (transition) => transition.enrolledDeviceId,
      );
      const encryptedCredentialState =
        await this.crypto.encryptDeviceSyncCredentialState(
          {
            currentCredentials: candidate.replacementAccess.credentials,
            previousCredentials: {
              credentials: candidate.previousState.currentCredentials,
              revokedDeviceIds,
              vaultKeyGeneration:
                candidate.remoteSnapshot.metadata.vaultKeyGeneration,
            },
          },
          unlockedVault.deviceLocalProtectionKey,
          candidate.credentialContext,
        );
      const hasContentChanges =
        entryReviews.length > 0 ||
        tagReviews.length > 0 ||
        folderReviews.length > 0 ||
        deviceProfileReviews.length > 0;
      let syncUpload: SyncUploadStatus = "complete";

      if (!hasContentChanges) {
        await this.persistRemoteSnapshot(
          sessionId,
          unlockedVault,
          candidate.remoteSnapshot,
          candidate.remoteTrust.state,
          candidate.remoteVault,
          candidate.vaultMasterKey,
          candidate.previousEncryptedState,
          encryptedCredentialState,
        );
        vaultMasterKeyTransferred = true;
      } else {
        let resolvedVault: Vault;

        try {
          resolvedVault = applyVaultSyncResolution(
            candidate.trustTransitionBaseline,
            candidate.remoteVault,
            { entryReviews, tagReviews, folderReviews, deviceProfileReviews },
            resolution,
            unlockedVault.deviceId,
          );
        } catch (error) {
          if (error instanceof InvalidVaultSyncResolutionError) {
            throw new InvalidSyncResolutionError(params.vaultId, error);
          }

          throw error;
        }

        const resolvedSnapshot = await this.persistResolvedSnapshot({
          vaultId: params.vaultId,
          sessionId,
          sourceSnapshotVersionVector,
          unlockedVault,
          localSnapshot: candidate.localSnapshot,
          remoteSnapshot: candidate.remoteSnapshot,
          remoteSnapshotDescriptor: candidate.remoteSnapshotDescriptor,
          remoteTrust: candidate.remoteTrust,
          replacementAccess: candidate.replacementAccess,
          vaultMasterKey: candidate.vaultMasterKey,
          resolvedVault,
          previousEncryptedState: candidate.previousEncryptedState,
          encryptedCredentialState,
        });
        syncUpload = resolvedSnapshot.syncUpload;
        vaultMasterKeyTransferred = resolvedSnapshot.sessionCommitted;
      }

      return {
        revokedDeviceIds,
        enrolledDeviceIds,
        vaultKeyGeneration:
          candidate.remoteSnapshot.metadata.vaultKeyGeneration,
        providerCredentialRevocation: "pending_external_deletion",
        syncUpload,
      };
    } finally {
      if (!vaultMasterKeyTransferred) {
        bestEffortWipeArrayBuffers([candidate.vaultMasterKey]);
      }
    }
  }

  private async persistRemoteSnapshot(
    sessionId: string,
    unlockedVault: UnlockedVault,
    remoteSnapshot: VaultSnapshot,
    remoteTrust: VerifiedVaultTrustState,
    remoteVault: Vault,
    vaultMasterKey: VaultMasterKey,
    previousEncryptedState: EncryptedDeviceSyncCredentialState,
    encryptedCredentialState: EncryptedDeviceSyncCredentialState,
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
      async () =>
        this.vaultLocalRepository.saveVaultSnapshotWithCheckpoint({
          expectedSnapshotDigest:
            unlockedVault.trustedSnapshotContext.snapshotDigest,
          expectedCheckpoint,
          expectedSyncCredentialState: previousEncryptedState,
          snapshot: remoteSnapshot,
          checkpoint,
          syncCredentialState: encryptedCredentialState,
        }),
    );

    await this.unlockedVaultSession.commitPersistedSnapshot(
      sessionId,
      {
        ...unlockedVault,
        vault: remoteVault,
        vaultMasterKey,
        trustedSnapshotContext: {
          snapshotDigest,
          trust: remoteTrust,
        },
      },
      remoteSnapshot.metadata.snapshotVersionVector,
    );
  }

  private async persistResolvedSnapshot(params: {
    readonly vaultId: string;
    readonly sessionId: string;
    readonly sourceSnapshotVersionVector: VersionVector;
    readonly unlockedVault: UnlockedVault;
    readonly localSnapshot: VaultSnapshot;
    readonly remoteSnapshot: VaultSnapshot;
    readonly remoteSnapshotDescriptor: VaultSnapshotDescriptor;
    readonly remoteTrust: {
      readonly chain: VaultTrustChain;
      readonly state: VerifiedVaultTrustState;
      readonly snapshotDigest: string;
    };
    readonly replacementAccess: SyncAccess;
    readonly vaultMasterKey: VaultMasterKey;
    readonly resolvedVault: Vault;
    readonly previousEncryptedState: EncryptedDeviceSyncCredentialState;
    readonly encryptedCredentialState: EncryptedDeviceSyncCredentialState;
  }): Promise<{
    readonly syncUpload: SyncUploadStatus;
    readonly sessionCommitted: boolean;
  }> {
    const rotatedUnlockedVault = {
      ...params.unlockedVault,
      vault: params.resolvedVault,
      vaultMasterKey: params.vaultMasterKey,
    };
    const { persistedSnapshot, preparedRestore } =
      await this.unlockedVaultSession.persistForActiveSession(
        params.sessionId,
        params.vaultId,
        async () => {
          const preparedRestore =
            await this.vaultSnapshot.prepareLocalVaultSnapshotRestore(
              params.localSnapshot,
              params.unlockedVault,
              params.previousEncryptedState,
            );
          const persistedSnapshot =
            await this.vaultSnapshot.persistUnlockedVault(
              params.vaultId,
              rotatedUnlockedVault,
              params.sourceSnapshotVersionVector,
              {
                baseSnapshotVersionVector: mergeVersionVectors(
                  params.localSnapshot.metadata.snapshotVersionVector,
                  params.remoteSnapshot.metadata.snapshotVersionVector,
                ),
                keySlots: params.remoteSnapshot.keySlots,
                vaultKeyGeneration:
                  params.remoteSnapshot.metadata.vaultKeyGeneration,
                nextTrust: params.remoteTrust,
                uploadExpectedRemoteSnapshotIdentity: {
                  descriptor: params.remoteSnapshotDescriptor,
                  snapshotDigest: params.remoteTrust.snapshotDigest,
                },
                expectedSyncCredentialState: params.previousEncryptedState,
                syncCredentialState: params.encryptedCredentialState,
              },
            );

          return { persistedSnapshot, preparedRestore };
        },
      );

    const syncUpload = await this.vaultSyncGuard.uploadPersistedSnapshot({
      vaultId: params.vaultId,
      syncAccess: params.replacementAccess,
      persistedSnapshot: persistedSnapshot.snapshot,
      expectedRemoteSnapshotIdentity: {
        descriptor: cloneVaultSnapshotDescriptor(
          params.remoteSnapshotDescriptor,
        ),
        snapshotDigest: params.remoteTrust.snapshotDigest,
      },
      previousSnapshotVersionVector: params.sourceSnapshotVersionVector,
      persistedSnapshotDigest:
        persistedSnapshot.trustedSnapshotContext.snapshotDigest,
      checkpoint: persistedSnapshot.checkpoint,
      persistedSyncCredentialState: params.encryptedCredentialState,
      unlockedVault: rotatedUnlockedVault,
      preparedRestore,
      sessionId: params.sessionId,
    });

    const sessionCommitted =
      await this.unlockedVaultSession.commitPersistedSnapshotIfSessionIsActive(
        params.sessionId,
        {
          ...rotatedUnlockedVault,
          trustedSnapshotContext: persistedSnapshot.trustedSnapshotContext,
        },
        persistedSnapshot.snapshotVersionVector,
      );

    return { syncUpload, sessionCommitted };
  }
}
