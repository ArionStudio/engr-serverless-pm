import { areJsonEqual } from "../../domain/common";
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
import { applyVaultSyncResolution } from "../../domain/sync/sync-resolution.utils";
import { findChangedTags } from "../../domain/sync/tag-review.utils";
import type {
  VaultMasterKey,
  VaultSnapshot,
  VaultSnapshotDescriptor,
} from "../../domain/snapshot";
import type { Vault } from "../../domain/vault";
import type { VersionVector } from "../../domain/versioning";
import { mergeVersionVectors } from "../../domain/versioning";
import {
  InvalidSyncResolutionError,
  InvalidVaultSyncResolutionError,
  LocalSyncCredentialsMissingError,
  RemoteVaultSnapshotChangedError,
  ReplacementSyncCredentialsUnchangedError,
  SyncConflictDetectedError,
  SyncResolutionIncompleteError,
} from "../../errors/sync.errors";
import { InvalidDeviceRevocationTransitionError } from "../../errors/device-revocation.errors";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import { DeviceRevocationConsumptionService } from "../../services/trust/device-revocation-consumption.service";
import { VaultTrustService } from "../../services/trust/vault-trust.service";

export type ConsumeDeviceRevocationCommandParams = {
  readonly vaultId: string;
  readonly replacementSyncConfig: SyncSetupInput;
  readonly remoteSnapshotDescriptor: VaultSnapshotDescriptor;
  readonly resolution: VaultSyncResolution;
};

export type ConsumeDeviceRevocationResult = {
  readonly revokedDeviceIds: readonly string[];
  readonly enrolledDeviceIds: readonly string[];
  readonly vaultKeyGeneration: number;
  readonly providerCredentialRevocation: "pending_external_disable";
};

export class ConsumeDeviceRevocationUseCase {
  private readonly crypto: CryptoPort;
  private readonly syncProvider: SyncProviderPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultSnapshot: VaultSnapshotService;
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;
  private readonly revocationConsumption: DeviceRevocationConsumptionService;
  private readonly vaultTrust: VaultTrustService;

  constructor(
    crypto: CryptoPort,
    syncProvider: SyncProviderPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultSnapshot: VaultSnapshotService,
    vaultLocalRepository: VaultLocalRepositoryPort,
  ) {
    this.crypto = crypto;
    this.syncProvider = syncProvider;
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultSnapshot = vaultSnapshot;
    this.vaultLocalRepository = vaultLocalRepository;
    this.revocationConsumption = new DeviceRevocationConsumptionService(
      crypto,
      syncProvider,
      vaultSnapshot,
    );
    this.vaultTrust = new VaultTrustService(crypto);
  }

  async execute(
    params: ConsumeDeviceRevocationCommandParams,
  ): Promise<ConsumeDeviceRevocationResult> {
    if (params.remoteSnapshotDescriptor.vaultId !== params.vaultId) {
      throw new InvalidSyncResolutionError(
        params.vaultId,
        new Error("Remote snapshot descriptor belongs to another vault."),
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
      expectedRemoteSnapshotDescriptor: params.remoteSnapshotDescriptor,
    });
    const previousEncryptedState =
      await this.vaultLocalRepository.getDeviceSyncCredentialState(
        params.vaultId,
      );

    if (previousEncryptedState === null) {
      throw new LocalSyncCredentialsMissingError(params.vaultId);
    }

    const syncTarget = unlockedVault.vault.syncTarget;

    if (syncTarget === undefined) {
      throw new InvalidDeviceRevocationTransitionError(
        params.vaultId,
        "the local vault has no sync target",
      );
    }

    const credentialContext = {
      vaultId: params.vaultId,
      deviceId: unlockedVault.deviceId,
      provider: syncTarget.provider,
      target: syncTarget,
    } as const;
    const previousState = await this.crypto.decryptDeviceSyncCredentialState(
      previousEncryptedState,
      unlockedVault.deviceLocalProtectionKey,
      credentialContext,
    );

    if (previousState.previousCredentials !== undefined) {
      throw new InvalidDeviceRevocationTransitionError(
        params.vaultId,
        "provider credential revocation is already pending",
      );
    }

    if (
      areJsonEqual(
        candidate.replacementAccess.credentials,
        previousState.currentCredentials,
      )
    ) {
      throw new ReplacementSyncCredentialsUnchangedError(params.vaultId);
    }

    const entryReviews = findChangedEntries(
      candidate.trustTransitionBaseline,
      candidate.remoteVault,
    );
    const tagReviews = findChangedTags(
      candidate.trustTransitionBaseline,
      candidate.remoteVault,
    );
    const deviceProfileReviews = findChangedDeviceProfiles(
      candidate.trustTransitionBaseline,
      candidate.remoteVault,
    );

    if (
      entryReviews.length !== params.resolution.entryResolutions.length ||
      tagReviews.length !== params.resolution.tagResolutions.length ||
      deviceProfileReviews.length !==
        params.resolution.deviceProfileResolutions.length
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
            credentials: previousState.currentCredentials,
            revokedDeviceIds,
            vaultKeyGeneration:
              candidate.remoteSnapshot.metadata.vaultKeyGeneration,
          },
        },
        unlockedVault.deviceLocalProtectionKey,
        credentialContext,
      );
    const hasContentChanges =
      entryReviews.length > 0 ||
      tagReviews.length > 0 ||
      deviceProfileReviews.length > 0;

    if (!hasContentChanges) {
      await this.persistRemoteSnapshot(
        sessionId,
        unlockedVault,
        candidate.remoteSnapshot,
        candidate.remoteTrust.state,
        candidate.remoteVault,
        candidate.vaultMasterKey,
        encryptedCredentialState,
      );
    } else {
      let resolvedVault: Vault;

      try {
        resolvedVault = applyVaultSyncResolution(
          candidate.trustTransitionBaseline,
          candidate.remoteVault,
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

      await this.persistResolvedSnapshot({
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
        previousEncryptedState,
        encryptedCredentialState,
      });
    }

    return {
      revokedDeviceIds,
      enrolledDeviceIds,
      vaultKeyGeneration: candidate.remoteSnapshot.metadata.vaultKeyGeneration,
      providerCredentialRevocation: "pending_external_disable",
    };
  }

  private async persistRemoteSnapshot(
    sessionId: string,
    unlockedVault: UnlockedVault,
    remoteSnapshot: VaultSnapshot,
    remoteTrust: VerifiedVaultTrustState,
    remoteVault: Vault,
    vaultMasterKey: VaultMasterKey,
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

    await this.unlockedVaultSession.persistForActiveSession(
      sessionId,
      unlockedVault.vaultId,
      async () =>
        this.vaultLocalRepository.saveVaultSnapshotWithCheckpoint({
          expectedSnapshotDigest:
            unlockedVault.trustedSnapshotContext.snapshotDigest,
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
    };
    readonly replacementAccess: SyncAccess;
    readonly vaultMasterKey: VaultMasterKey;
    readonly resolvedVault: Vault;
    readonly previousEncryptedState: EncryptedDeviceSyncCredentialState;
    readonly encryptedCredentialState: EncryptedDeviceSyncCredentialState;
  }): Promise<void> {
    const rotatedUnlockedVault = {
      ...params.unlockedVault,
      vault: params.resolvedVault,
      vaultMasterKey: params.vaultMasterKey,
    };
    const persistedSnapshot =
      await this.unlockedVaultSession.persistForActiveSession(
        params.sessionId,
        params.vaultId,
        async () =>
          this.vaultSnapshot.persistUnlockedVault(
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
              syncCredentialState: params.encryptedCredentialState,
            },
          ),
      );

    try {
      await this.syncProvider.uploadVaultSnapshot(
        params.replacementAccess,
        persistedSnapshot.snapshot,
        params.remoteSnapshotDescriptor,
      );
    } catch (error) {
      await this.unlockedVaultSession.restorePersistedState(
        params.sessionId,
        params.vaultId,
        async () =>
          this.vaultSnapshot.restoreLocalVaultSnapshot(
            params.localSnapshot,
            persistedSnapshot.snapshot,
            params.unlockedVault,
            params.previousEncryptedState,
          ),
      );

      if (error instanceof RemoteVaultSnapshotChangedError) {
        throw new SyncConflictDetectedError(params.vaultId);
      }

      throw error;
    }

    await this.unlockedVaultSession.commitPersistedSnapshot(
      params.sessionId,
      {
        ...rotatedUnlockedVault,
        trustedSnapshotContext: persistedSnapshot.trustedSnapshotContext,
      },
      persistedSnapshot.snapshotVersionVector,
    );
  }
}
