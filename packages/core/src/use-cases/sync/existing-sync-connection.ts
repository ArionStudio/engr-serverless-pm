import { areJsonEqual } from "../../domain/common";
import { findChangesInKeySlots } from "../../domain/sync/key-slot-review.utils";
import { requireDeviceProfilesMatchTrust } from "../../domain/sync/device-profile-review.utils";
import type {
  SyncAccess,
  SyncSetupInput,
} from "../../domain/sync/sync-config.type";
import type {
  ReviewedVaultSnapshotIdentities,
  VaultSnapshot,
} from "../../domain/snapshot";
import {
  areVaultSnapshotIdentitiesEqual,
  areVaultSnapshotDescriptorsEqual,
  cloneReviewedVaultSnapshotIdentities,
  compareVaultSnapshotDescriptors,
  toVaultSnapshotDescriptor,
  toVaultSnapshotIdentity,
} from "../../domain/snapshot";
import type { Vault } from "../../domain/vault";
import {
  InvalidSyncConfigError,
  LocalVaultSnapshotAheadError,
  ProviderCredentialRevocationPendingError,
  RemoteVaultSnapshotChangedError,
  RemoteVaultSnapshotIntegrityError,
  RemoteVaultSnapshotNotFoundError,
  SyncAlreadyConfiguredError,
  SyncRemovalPendingError,
  SyncTrustChangeRequiresDeviceTrustFlowError,
} from "../../errors/sync.errors";
import { LocalVaultSnapshotChangedError } from "../../errors/vault-snapshot.errors";
import type { CryptoPort } from "../../ports/crypto";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import type { UnlockedVaultSession } from "../../domain/session";
import type { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";

type VerifiedExistingSyncConnection = {
  readonly syncAccess: SyncAccess;
  readonly localSnapshot: VaultSnapshot;
  readonly remoteSnapshot: VaultSnapshot;
  readonly remoteVault: Vault;
  readonly remoteTrust: Awaited<
    ReturnType<VaultSnapshotService["verifyCandidateSnapshotTrust"]>
  >;
  readonly reviewedSnapshotIdentities: ReviewedVaultSnapshotIdentities;
};

async function loadVerifiedExistingSyncConnection(params: {
  readonly vaultId: string;
  readonly syncConfig: SyncSetupInput;
  readonly session: UnlockedVaultSession;
  readonly syncProvider: SyncProviderPort;
  readonly vaultSnapshot: VaultSnapshotService;
  readonly vaultLocalRepository: VaultLocalRepositoryPort;
}): Promise<VerifiedExistingSyncConnection> {
  const { unlockedVault, sourceSnapshotVersionVector } = params.session;

  if (unlockedVault.vault.syncTarget !== undefined) {
    throw new SyncAlreadyConfiguredError(params.vaultId);
  }

  if (unlockedVault.vault.syncRemovalPending !== undefined) {
    throw new SyncRemovalPendingError(
      params.vaultId,
      "connect existing sync storage",
    );
  }

  if (unlockedVault.vault.providerCredentialRevocationPending !== undefined) {
    throw new ProviderCredentialRevocationPendingError(
      params.vaultId,
      "connect existing sync storage",
    );
  }

  if (
    (await params.vaultLocalRepository.getDeviceSyncCredentialState(
      params.vaultId,
    )) !== null
  ) {
    throw new SyncAlreadyConfiguredError(params.vaultId);
  }

  const localSnapshot =
    await params.vaultSnapshot.requireCurrentSnapshotForUnlockedVault(
      params.vaultId,
      unlockedVault,
      sourceSnapshotVersionVector,
    );

  let syncAccess: SyncAccess;

  try {
    syncAccess = await params.syncProvider.setup(
      JSON.parse(JSON.stringify(params.syncConfig)) as SyncSetupInput,
    );
  } catch {
    throw new InvalidSyncConfigError();
  }

  if (syncAccess.credentials.provider !== syncAccess.target.provider) {
    throw new InvalidSyncConfigError();
  }

  const remoteSnapshotDescriptor =
    await params.syncProvider.getLatestVaultSnapshotDescriptor(
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

  if (relation === "local_ahead") {
    throw new LocalVaultSnapshotAheadError(params.vaultId);
  }

  if (relation !== "remote_ahead") {
    throw new RemoteVaultSnapshotIntegrityError(params.vaultId);
  }

  const remoteSnapshot = await params.syncProvider.downloadVaultSnapshot(
    syncAccess,
    remoteSnapshotDescriptor,
  );

  if (
    !areVaultSnapshotDescriptorsEqual(
      toVaultSnapshotDescriptor(params.vaultId, remoteSnapshot),
      remoteSnapshotDescriptor,
    )
  ) {
    throw new RemoteVaultSnapshotChangedError(params.vaultId);
  }

  const remoteTrust = await params.vaultSnapshot.verifyCandidateSnapshotTrust(
    params.vaultId,
    remoteSnapshot,
    unlockedVault,
  );
  const localTrust = unlockedVault.trustedSnapshotContext.trust;

  if (
    remoteSnapshot.metadata.vaultCreationTimestamp !==
    localSnapshot.metadata.vaultCreationTimestamp
  ) {
    throw new RemoteVaultSnapshotIntegrityError(params.vaultId);
  }

  if (
    remoteTrust.state.generation !== localTrust.generation ||
    remoteTrust.state.certificateDigest !== localTrust.certificateDigest ||
    remoteTrust.state.vaultKeyGeneration !== localTrust.vaultKeyGeneration ||
    remoteSnapshot.metadata.vaultKeyGeneration !==
      localSnapshot.metadata.vaultKeyGeneration ||
    !remoteTrust.state.trustedDevices.some(
      (device) => device.deviceId === unlockedVault.deviceId,
    ) ||
    !remoteSnapshot.keySlots.deviceSlots.some(
      (slot) => slot.deviceId === unlockedVault.deviceId,
    )
  ) {
    throw new SyncTrustChangeRequiresDeviceTrustFlowError(params.vaultId);
  }

  try {
    const keySlotChanges = findChangesInKeySlots(
      localSnapshot.keySlots,
      remoteSnapshot.keySlots,
    );

    if (
      keySlotChanges.hasChanges ||
      !areJsonEqual(localSnapshot.keySlots, remoteSnapshot.keySlots)
    ) {
      throw new SyncTrustChangeRequiresDeviceTrustFlowError(params.vaultId);
    }
  } catch (error) {
    if (error instanceof SyncTrustChangeRequiresDeviceTrustFlowError) {
      throw error;
    }

    throw new SyncTrustChangeRequiresDeviceTrustFlowError(
      params.vaultId,
      error,
    );
  }

  const remoteVault = await params.vaultSnapshot.openTrustedVaultSnapshot(
    params.vaultId,
    remoteSnapshot,
    unlockedVault.vaultMasterKey,
  );

  if (!areJsonEqual(remoteVault.syncTarget, syncAccess.target)) {
    throw new RemoteVaultSnapshotIntegrityError(params.vaultId);
  }

  const trustedDeviceIds = new Set(
    localTrust.trustedDevices.map((device) => device.deviceId),
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

  if (remoteVault.syncRemovalPending !== undefined) {
    throw new SyncRemovalPendingError(
      params.vaultId,
      "connect existing sync storage",
    );
  }

  if (remoteVault.providerCredentialRevocationPending !== undefined) {
    throw new ProviderCredentialRevocationPendingError(
      params.vaultId,
      "connect existing sync storage",
    );
  }

  return {
    syncAccess,
    localSnapshot,
    remoteSnapshot,
    remoteVault,
    remoteTrust,
    reviewedSnapshotIdentities: {
      local: toVaultSnapshotIdentity(
        params.vaultId,
        localSnapshot,
        unlockedVault.trustedSnapshotContext.snapshotDigest,
      ),
      remote: toVaultSnapshotIdentity(
        params.vaultId,
        remoteSnapshot,
        remoteTrust.snapshotDigest,
      ),
    },
  };
}

export type PrepareExistingSyncConnectionCommandParams = {
  readonly vaultId: string;
  readonly syncConfig: SyncSetupInput;
};

export type PrepareExistingSyncConnectionResult = {
  readonly relation: "remote_ahead";
  readonly reviewedSnapshotIdentities: ReviewedVaultSnapshotIdentities;
};

export class PrepareExistingSyncConnectionUseCase {
  private readonly syncProvider: SyncProviderPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultSnapshot: VaultSnapshotService;
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;

  constructor(
    syncProvider: SyncProviderPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultSnapshot: VaultSnapshotService,
    vaultLocalRepository: VaultLocalRepositoryPort,
  ) {
    this.syncProvider = syncProvider;
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultSnapshot = vaultSnapshot;
    this.vaultLocalRepository = vaultLocalRepository;
  }

  async execute(
    params: PrepareExistingSyncConnectionCommandParams,
  ): Promise<PrepareExistingSyncConnectionResult> {
    const session = await this.unlockedVaultSession.requireUnlockedVaultContext(
      params.vaultId,
      "prepare existing sync connection",
    );
    const candidate = await loadVerifiedExistingSyncConnection({
      ...params,
      session,
      syncProvider: this.syncProvider,
      vaultSnapshot: this.vaultSnapshot,
      vaultLocalRepository: this.vaultLocalRepository,
    });

    return {
      relation: "remote_ahead",
      reviewedSnapshotIdentities: cloneReviewedVaultSnapshotIdentities(
        candidate.reviewedSnapshotIdentities,
      ),
    };
  }
}

export type ConnectExistingSyncCommandParams = {
  readonly vaultId: string;
  readonly syncConfig: SyncSetupInput;
  readonly reviewedSnapshotIdentities: ReviewedVaultSnapshotIdentities;
};

export type ConnectExistingSyncResult = {
  readonly snapshotVersionVector: Readonly<Record<string, number>>;
  readonly revisionTimestamp: number;
};

export class ConnectExistingSyncUseCase {
  private readonly crypto: CryptoPort;
  private readonly syncProvider: SyncProviderPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultSnapshot: VaultSnapshotService;
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;

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
  }

  async execute(
    params: ConnectExistingSyncCommandParams,
  ): Promise<ConnectExistingSyncResult> {
    const reviewedSnapshotIdentities = cloneReviewedVaultSnapshotIdentities(
      params.reviewedSnapshotIdentities,
    );
    const session = await this.unlockedVaultSession.requireUnlockedVaultContext(
      params.vaultId,
      "connect existing sync storage",
    );
    const candidate = await loadVerifiedExistingSyncConnection({
      vaultId: params.vaultId,
      syncConfig: params.syncConfig,
      session,
      syncProvider: this.syncProvider,
      vaultSnapshot: this.vaultSnapshot,
      vaultLocalRepository: this.vaultLocalRepository,
    });

    if (
      !areVaultSnapshotIdentitiesEqual(
        candidate.reviewedSnapshotIdentities.local,
        reviewedSnapshotIdentities.local,
      )
    ) {
      throw new LocalVaultSnapshotChangedError(params.vaultId);
    }

    if (
      !areVaultSnapshotIdentitiesEqual(
        candidate.reviewedSnapshotIdentities.remote,
        reviewedSnapshotIdentities.remote,
      )
    ) {
      throw new RemoteVaultSnapshotChangedError(params.vaultId);
    }

    const persistedSnapshot =
      await this.unlockedVaultSession.persistForActiveSession(
        session.sessionId,
        params.vaultId,
        async () => {
          const encryptedCredentialState =
            await this.crypto.encryptDeviceSyncCredentialState(
              { currentCredentials: candidate.syncAccess.credentials },
              session.unlockedVault.deviceLocalProtectionKey,
              {
                vaultId: params.vaultId,
                deviceId: session.unlockedVault.deviceId,
                provider: candidate.syncAccess.target.provider,
                target: candidate.syncAccess.target,
              },
            );

          return this.vaultSnapshot.persistVerifiedRemoteSnapshot(
            params.vaultId,
            candidate.remoteSnapshot,
            candidate.remoteTrust.state,
            session.unlockedVault,
            {
              expectedSyncCredentialState: null,
              syncCredentialState: encryptedCredentialState,
            },
          );
        },
      );

    await this.unlockedVaultSession.commitPersistedSnapshot(
      session.sessionId,
      {
        ...session.unlockedVault,
        vault: candidate.remoteVault,
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
