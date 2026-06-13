import type { VaultSnapshot } from "../../domain/snapshot/vault-snapshot";
import type { VaultMasterKey } from "../../domain/snapshot/brand-keys";
import type { RemoteVaultSnapshotDescriptor } from "../../domain/sync/remote-vault-snapshot-descriptor.type";
import type { SyncConfig } from "../../domain/sync/sync-config.type";
import {
  areRemoteVaultSnapshotDescriptorsEqual,
  compareLocalAndRemoteSnapshotDescriptors,
  toRemoteVaultSnapshotDescriptor,
} from "../../domain/sync/vault-snapshot-version.utils";
import type { VersionVectorRelation } from "../../domain/sync/version-vector.type";
import { createVaultSyncReview } from "../../domain/sync/vault-sync-review.utils";
import type { VaultSyncReview } from "../../domain/sync/vault-sync-review.type";
import type { Vault } from "../../domain/vault/vault";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import { UnsupportedAlgorithmSuiteError } from "../errors/algorithm-suite.errors";
import {
  RemoteVaultSnapshotChangedError,
  RemoteVaultSnapshotNotFoundError,
} from "../errors/sync.errors";
import {
  VaultSnapshotNotFoundError,
  VaultSnapshotSignatureVerificationFailedError,
  VaultSnapshotSignerNotTrustedError,
} from "../errors/unlock-vault.errors";

export type VaultSyncReviewSubject = {
  readonly localVault: Vault;
  readonly vaultMasterKey: VaultMasterKey;
};

export type PrepareVaultSyncReviewParams = VaultSyncReviewSubject & {
  readonly vaultId: string;
  readonly syncConfig: SyncConfig;
};

export type VaultSyncReviewPreparation = {
  readonly remoteSnapshotDescriptor: RemoteVaultSnapshotDescriptor;
  readonly relation: VersionVectorRelation;
  readonly review: VaultSyncReview;
};

export type LoadVaultSyncReviewForRemoteDescriptorParams =
  VaultSyncReviewSubject & {
    readonly vaultId: string;
    readonly syncConfig: SyncConfig;
    readonly remoteSnapshotDescriptor: RemoteVaultSnapshotDescriptor;
  };

export type VaultSyncReviewLoadResult = {
  readonly remoteVault: Vault;
  readonly review: VaultSyncReview;
};

export class VaultSyncReviewService {
  private readonly syncProvider: SyncProviderPort;
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;
  private readonly crypto: CryptoPort;

  constructor(
    syncProvider: SyncProviderPort,
    vaultLocalRepository: VaultLocalRepositoryPort,
    crypto: CryptoPort,
  ) {
    this.syncProvider = syncProvider;
    this.vaultLocalRepository = vaultLocalRepository;
    this.crypto = crypto;
  }

  async prepareReview(
    params: PrepareVaultSyncReviewParams,
  ): Promise<VaultSyncReviewPreparation> {
    const remoteSnapshotDescriptor =
      await this.syncProvider.getLatestVaultSnapshotDescriptor(
        params.syncConfig,
        params.vaultId,
      );

    if (remoteSnapshotDescriptor === null) {
      throw new RemoteVaultSnapshotNotFoundError(params.vaultId);
    }

    const localSnapshot = await this.getLocalSnapshot(params.vaultId);
    const localSnapshotDescriptor = toRemoteVaultSnapshotDescriptor(
      localSnapshot.metadata.id,
      params.localVault,
      localSnapshot,
    );
    const relation = compareLocalAndRemoteSnapshotDescriptors(
      localSnapshotDescriptor,
      remoteSnapshotDescriptor,
    );

    if (
      relation === "local_ahead" &&
      remoteSnapshotDescriptor.revisionTimestamp <=
        localSnapshot.metadata.revisionTimestamp
    ) {
      return {
        remoteSnapshotDescriptor,
        relation,
        review: createVaultSyncReview(
          params.localVault,
          params.localVault,
          toTrustState(localSnapshot),
          toTrustState(localSnapshot),
        ),
      };
    }

    if (
      relation === "equal" &&
      areRemoteVaultSnapshotDescriptorsEqual(
        remoteSnapshotDescriptor,
        localSnapshotDescriptor,
      )
    ) {
      return {
        remoteSnapshotDescriptor,
        relation,
        review: createVaultSyncReview(
          params.localVault,
          params.localVault,
          toTrustState(localSnapshot),
          toTrustState(localSnapshot),
        ),
      };
    }

    const loadedReview = await this.loadReviewForRemoteDescriptorWithSnapshot(
      {
        ...params,
        remoteSnapshotDescriptor,
      },
      localSnapshot,
    );

    return {
      remoteSnapshotDescriptor,
      relation,
      review: loadedReview.review,
    };
  }

  async loadReviewForRemoteDescriptor(
    params: LoadVaultSyncReviewForRemoteDescriptorParams,
  ): Promise<VaultSyncReviewLoadResult> {
    return this.loadReviewForRemoteDescriptorWithSnapshot(
      params,
      await this.getLocalSnapshot(params.vaultId),
    );
  }

  private async loadReviewForRemoteDescriptorWithSnapshot(
    params: LoadVaultSyncReviewForRemoteDescriptorParams,
    localSnapshot: VaultSnapshot,
  ): Promise<VaultSyncReviewLoadResult> {
    const remoteSnapshot = await this.downloadVerifiedRemoteSnapshot(
      params.syncConfig,
      params.remoteSnapshotDescriptor,
      params.vaultId,
      localSnapshot,
    );
    const remoteVault = await this.crypto.decryptVaultSnapshotContent(
      remoteSnapshot.content,
      params.vaultMasterKey,
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

    return {
      remoteVault,
      review: createVaultSyncReview(
        params.localVault,
        remoteVault,
        toTrustState(localSnapshot),
        toTrustState(remoteSnapshot),
      ),
    };
  }

  private async getLocalSnapshot(vaultId: string): Promise<VaultSnapshot> {
    const localSnapshot =
      await this.vaultLocalRepository.getVaultSnapshot(vaultId);

    if (localSnapshot === null) {
      throw new VaultSnapshotNotFoundError(vaultId);
    }

    return localSnapshot;
  }

  private async downloadVerifiedRemoteSnapshot(
    syncConfig: SyncConfig,
    remoteSnapshotDescriptor: RemoteVaultSnapshotDescriptor,
    vaultId: string,
    localSnapshot: VaultSnapshot,
  ): Promise<VaultSnapshot> {
    const remoteSnapshot = await this.syncProvider.downloadVaultSnapshot(
      syncConfig,
      remoteSnapshotDescriptor,
    );

    if (
      remoteSnapshot.metadata.algorithmSuiteId !== this.crypto.algorithmSuite.id
    ) {
      throw new UnsupportedAlgorithmSuiteError({
        vaultId,
        artifact: "vault snapshot",
        expectedAlgorithmSuiteId: this.crypto.algorithmSuite.id,
        actualAlgorithmSuiteId: remoteSnapshot.metadata.algorithmSuiteId,
      });
    }

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
