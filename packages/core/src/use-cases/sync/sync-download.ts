import type { VaultSnapshot } from "../../domain/snapshot/vault-snapshot";
import {
  areRemoteVaultSnapshotDescriptorsEqual,
  compareLocalAndRemoteSnapshotDescriptors,
} from "../../domain/sync/vault-snapshot-version.utils";
import type { VersionVectorRelation } from "../../domain/sync/version-vector.type";
import { createVaultSyncReview } from "../../domain/sync/vault-sync-review.utils";
import type { VaultSyncReview } from "../../domain/sync/vault-sync-review.type";
import type { RemoteVaultSnapshotDescriptor } from "../../domain/sync/remote-vault-snapshot-descriptor.type";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import type { UnlockedVaultSessionService } from "../../application/vault-session/unlocked-vault-session.service";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import {
  RemoteVaultSnapshotNotFoundError,
  SyncNotConfiguredError,
} from "../__errors/sync.errors";
import {
  VaultSnapshotNotFoundError,
  VaultSnapshotSignatureVerificationFailedError,
  VaultSnapshotSignerNotTrustedError,
} from "../__errors/unlock-vault.errors";
import { VaultMustBeUnlockedError } from "../__errors/vault-session.errors";

export type SyncDownloadCommandParams = {
  readonly vaultId: string;
};

export type SyncDownloadResult = {
  readonly remoteSnapshotDescriptor: RemoteVaultSnapshotDescriptor;
  readonly relation: VersionVectorRelation;
  readonly review: VaultSyncReview;
};

export class SyncDownloadUseCase {
  private readonly syncProvider: SyncProviderPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;
  private readonly crypto: CryptoPort;

  constructor(
    syncProvider: SyncProviderPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultLocalRepository: VaultLocalRepositoryPort,
    crypto: CryptoPort,
  ) {
    this.syncProvider = syncProvider;
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultLocalRepository = vaultLocalRepository;
    this.crypto = crypto;
  }

  async execute(
    params: SyncDownloadCommandParams,
  ): Promise<SyncDownloadResult> {
    const unlockedVaultSession = await this.unlockedVaultSession.get();
    const unlockedVault = unlockedVaultSession?.unlockedVault;

    if (unlockedVault?.vaultId !== params.vaultId) {
      throw new VaultMustBeUnlockedError(params.vaultId, "sync download");
    }

    const syncConfig = unlockedVault.vault.syncConfig;

    if (syncConfig === undefined) {
      throw new SyncNotConfiguredError(params.vaultId, "sync download");
    }

    const remoteSnapshotDescriptor =
      await this.syncProvider.getLatestVaultSnapshotDescriptor(
        syncConfig,
        params.vaultId,
      );

    if (remoteSnapshotDescriptor === null) {
      throw new RemoteVaultSnapshotNotFoundError(params.vaultId);
    }

    const localSnapshot = await this.vaultLocalRepository.getVaultSnapshot(
      params.vaultId,
    );

    if (localSnapshot === null) {
      throw new VaultSnapshotNotFoundError(params.vaultId);
    }

    const localSnapshotDescriptor = {
      vaultId: localSnapshot.metadata.id,
      versionVector: unlockedVault.vault.versionVector,
      revisionTimestamp: localSnapshot.metadata.revisionTimestamp,
    };
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
          unlockedVault.vault,
          unlockedVault.vault,
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
          unlockedVault.vault,
          unlockedVault.vault,
          toTrustState(localSnapshot),
          toTrustState(localSnapshot),
        ),
      };
    }

    const remoteSnapshot = await this.syncProvider.downloadVaultSnapshot(
      syncConfig,
      remoteSnapshotDescriptor,
    );

    const signerDevice = localSnapshot.trustedDevices.find(
      (device) => device.id === remoteSnapshot.metadata.createdByDeviceId,
    );

    if (signerDevice === undefined) {
      throw new VaultSnapshotSignerNotTrustedError(
        params.vaultId,
        remoteSnapshot.metadata.createdByDeviceId,
      );
    }

    const isSnapshotAuthentic = await this.crypto.verifyVaultSnapshotSignature(
      remoteSnapshot,
      signerDevice.publicKeys.signingKey,
    );

    if (!isSnapshotAuthentic) {
      throw new VaultSnapshotSignatureVerificationFailedError(params.vaultId);
    }

    const remoteVault = await this.crypto.decryptVaultSnapshotContent(
      remoteSnapshot.content,
      unlockedVault.vaultMasterKey,
    );

    return {
      remoteSnapshotDescriptor,
      relation,
      review: createVaultSyncReview(
        unlockedVault.vault,
        remoteVault,
        toTrustState(localSnapshot),
        toTrustState(remoteSnapshot),
      ),
    };
  }
}

function toTrustState(snapshot: VaultSnapshot) {
  return {
    trustedDevices: snapshot.trustedDevices,
    keySlots: snapshot.keySlots,
  };
}
