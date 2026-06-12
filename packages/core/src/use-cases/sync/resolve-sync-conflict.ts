import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import type { RemoteVaultSnapshotDescriptor } from "../../domain/sync/remote-vault-snapshot-descriptor.type";
import type { VaultSnapshot } from "../../domain/snapshot/vault-snapshot";
import type { VaultSyncResolution } from "../../domain/sync/vault-sync-review.type";
import { areRemoteVaultSnapshotDescriptorsEqual } from "../../domain/sync/vault-snapshot-version.utils";
import {
  applyVaultSyncResolution,
  createVaultSyncReview,
} from "../../domain/sync/vault-sync-review.utils";
import {
  InvalidSyncResolutionError,
  RemoteVaultSnapshotChangedError,
  SyncConflictDetectedError,
  SyncNotConfiguredError,
  SyncResolutionIncompleteError,
  SyncTrustChangeRequiresDeviceTrustFlowError,
} from "../../application/errors/sync.errors";
import {
  VaultSnapshotNotFoundError,
  VaultSnapshotSignatureVerificationFailedError,
  VaultSnapshotSignerNotTrustedError,
} from "../../application/errors/unlock-vault.errors";
import { VaultMustBeUnlockedError } from "../../application/errors/vault-session.errors";
import type { UnlockedVaultSessionService } from "../../application/vault-session/unlocked-vault-session.service";
import type {
  PersistUnlockedVaultResult,
  VaultSnapshotService,
} from "../../application/vault-snapshots/vault-snapshot.service";

export type ResolveSyncConflictCommandParams = {
  readonly vaultId: string;
  readonly remoteSnapshotDescriptor: RemoteVaultSnapshotDescriptor;
  readonly resolution: VaultSyncResolution;
};

export type ResolveSyncConflictResult = PersistUnlockedVaultResult;

export class ResolveSyncConflictUseCase {
  private readonly syncProvider: SyncProviderPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;
  private readonly crypto: CryptoPort;
  private readonly vaultSnapshot: VaultSnapshotService;

  constructor(
    syncProvider: SyncProviderPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultLocalRepository: VaultLocalRepositoryPort,
    crypto: CryptoPort,
    vaultSnapshot: VaultSnapshotService,
  ) {
    this.syncProvider = syncProvider;
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultLocalRepository = vaultLocalRepository;
    this.crypto = crypto;
    this.vaultSnapshot = vaultSnapshot;
  }

  async execute(
    params: ResolveSyncConflictCommandParams,
  ): Promise<ResolveSyncConflictResult> {
    const unlockedVaultSession = await this.unlockedVaultSession.get();
    const unlockedVault = unlockedVaultSession?.unlockedVault;

    if (unlockedVault?.vaultId !== params.vaultId) {
      throw new VaultMustBeUnlockedError(params.vaultId, "resolve sync");
    }

    if (params.remoteSnapshotDescriptor.vaultId !== params.vaultId) {
      throw new InvalidSyncResolutionError(
        params.vaultId,
        new Error("Remote snapshot descriptor belongs to another vault."),
      );
    }

    const syncConfig = unlockedVault.vault.syncConfig;

    if (syncConfig === undefined) {
      throw new SyncNotConfiguredError(params.vaultId, "resolve sync");
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

    const localSnapshot = await this.vaultLocalRepository.getVaultSnapshot(
      params.vaultId,
    );

    if (localSnapshot === null) {
      throw new VaultSnapshotNotFoundError(params.vaultId);
    }

    const remoteSnapshot = await this.downloadVerifiedRemoteSnapshot(
      syncConfig,
      params.remoteSnapshotDescriptor,
      params.vaultId,
      localSnapshot,
    );
    const remoteVault = await this.crypto.decryptVaultSnapshotContent(
      remoteSnapshot.content,
      unlockedVault.vaultMasterKey,
    );
    const review = createVaultSyncReview(
      unlockedVault.vault,
      remoteVault,
      toTrustState(localSnapshot),
      toTrustState(remoteSnapshot),
    );

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
    );

    await this.unlockedVaultSession.commitPersistedSnapshot(
      updatedUnlockedVault,
      persistedSnapshot.revision,
    );

    const resolvedSnapshot = await this.vaultLocalRepository.getVaultSnapshot(
      params.vaultId,
    );

    if (resolvedSnapshot === null) {
      throw new VaultSnapshotNotFoundError(params.vaultId);
    }

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

  private async downloadVerifiedRemoteSnapshot(
    syncConfig: Parameters<SyncProviderPort["downloadVaultSnapshot"]>[0],
    remoteSnapshotDescriptor: RemoteVaultSnapshotDescriptor,
    vaultId: string,
    localSnapshot: VaultSnapshot,
  ): Promise<VaultSnapshot> {
    const remoteSnapshot = await this.syncProvider.downloadVaultSnapshot(
      syncConfig,
      remoteSnapshotDescriptor,
    );
    const signerDevice = localSnapshot.trustedDevices.find(
      (device) => device.id === remoteSnapshot.metadata.createdByDeviceId,
    );

    if (signerDevice === undefined) {
      throw new VaultSnapshotSignerNotTrustedError(
        vaultId,
        remoteSnapshot.metadata.createdByDeviceId,
      );
    }

    const isSnapshotAuthentic = await this.crypto.verifyVaultSnapshotSignature(
      remoteSnapshot,
      signerDevice.publicKeys.signingKey,
    );

    if (!isSnapshotAuthentic) {
      throw new VaultSnapshotSignatureVerificationFailedError(vaultId);
    }

    return remoteSnapshot;
  }
}

function toTrustState(snapshot: VaultSnapshot) {
  return {
    trustedDevices: snapshot.trustedDevices,
    keySlots: snapshot.keySlots,
  };
}
