import { areJsonEqual } from "../../domain/common";
import {
  areVaultSnapshotDescriptorsEqual,
  toVaultSnapshotDescriptor,
} from "../../domain/snapshot";
import { clearVaultProviderCredentialRevocationPending } from "../../domain/vault/vault-sync-config.mutations";
import {
  LocalSyncCredentialsMissingError,
  PreviousSyncCredentialStillActiveError,
  RemoteVaultSnapshotChangedError,
  RemoteVaultSnapshotNotFoundError,
  SyncConflictDetectedError,
  SyncNotConfiguredError,
} from "../../errors/sync.errors";
import { InvalidDeviceRevocationTransitionError } from "../../errors/device-revocation.errors";
import { LocalVaultTrustCheckpointNotFoundError } from "../../errors/vault-trust.errors";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import type { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import type { VaultSyncGuardService } from "../../services/sync";

export type CompleteProviderCredentialRevocationCommandParams = {
  readonly vaultId: string;
};

export class CompleteProviderCredentialRevocationUseCase {
  private readonly crypto: CryptoPort;
  private readonly syncProvider: SyncProviderPort;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly vaultSnapshot: VaultSnapshotService;
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;
  private readonly vaultSyncGuard: VaultSyncGuardService;

  constructor(
    crypto: CryptoPort,
    syncProvider: SyncProviderPort,
    unlockedVaultSession: UnlockedVaultSessionService,
    vaultSnapshot: VaultSnapshotService,
    vaultLocalRepository: VaultLocalRepositoryPort,
    vaultSyncGuard: VaultSyncGuardService,
  ) {
    this.crypto = crypto;
    this.syncProvider = syncProvider;
    this.unlockedVaultSession = unlockedVaultSession;
    this.vaultSnapshot = vaultSnapshot;
    this.vaultLocalRepository = vaultLocalRepository;
    this.vaultSyncGuard = vaultSyncGuard;
  }

  async execute(
    params: CompleteProviderCredentialRevocationCommandParams,
  ): Promise<{
    readonly providerCredentialRevocation:
      | "complete"
      | "pending_external_disable";
  }> {
    const { sessionId, sourceSnapshotVersionVector, unlockedVault } =
      await this.unlockedVaultSession.requireUnlockedVaultContext(
        params.vaultId,
        "complete provider credential revocation",
      );
    const syncTarget = unlockedVault.vault.syncTarget;

    if (syncTarget === undefined) {
      throw new SyncNotConfiguredError(
        params.vaultId,
        "complete provider credential revocation",
      );
    }

    const encryptedState =
      await this.vaultLocalRepository.getDeviceSyncCredentialState(
        params.vaultId,
      );

    if (encryptedState === null) {
      throw new LocalSyncCredentialsMissingError(params.vaultId);
    }

    const context = {
      vaultId: params.vaultId,
      deviceId: unlockedVault.deviceId,
      provider: syncTarget.provider,
      target: syncTarget,
    } as const;
    const state = await this.crypto.decryptDeviceSyncCredentialState(
      encryptedState,
      unlockedVault.deviceLocalProtectionKey,
      context,
    );

    const sharedPending =
      unlockedVault.vault.providerCredentialRevocationPending;

    if (state.previousCredentials === undefined) {
      return {
        providerCredentialRevocation:
          sharedPending === undefined ? "complete" : "pending_external_disable",
      };
    }

    const snapshot =
      await this.vaultSnapshot.requireCurrentSnapshotForUnlockedVault(
        params.vaultId,
        unlockedVault,
        sourceSnapshotVersionVector,
      );

    if (
      state.previousCredentials.vaultKeyGeneration !==
      snapshot.metadata.vaultKeyGeneration
    ) {
      throw new InvalidDeviceRevocationTransitionError(
        params.vaultId,
        "pending provider credential generation does not match the snapshot",
      );
    }

    const access = {
      target: syncTarget,
      credentials: state.previousCredentials.credentials,
    };
    const result = await this.syncProvider.checkVaultAccess(
      access,
      params.vaultId,
    );

    if (result === "accessible") {
      throw new PreviousSyncCredentialStillActiveError(params.vaultId);
    }

    const completedState = await this.crypto.encryptDeviceSyncCredentialState(
      { currentCredentials: state.currentCredentials },
      unlockedVault.deviceLocalProtectionKey,
      context,
    );
    const localPending = {
      revokedDeviceIds: state.previousCredentials.revokedDeviceIds,
      vaultKeyGeneration: state.previousCredentials.vaultKeyGeneration,
    };
    const sharedMarkerMatches =
      sharedPending !== undefined && areJsonEqual(sharedPending, localPending);

    if (!sharedMarkerMatches) {
      const checkpoint =
        await this.vaultLocalRepository.getLocalVaultTrustCheckpoint(
          params.vaultId,
        );

      if (checkpoint === null) {
        throw new LocalVaultTrustCheckpointNotFoundError(params.vaultId);
      }

      await this.unlockedVaultSession.persistForActiveSession(
        sessionId,
        params.vaultId,
        async () =>
          this.vaultLocalRepository.saveVaultSnapshotWithCheckpoint({
            expectedSnapshotDigest:
              unlockedVault.trustedSnapshotContext.snapshotDigest,
            snapshot,
            checkpoint,
            syncCredentialState: completedState,
          }),
      );

      return {
        providerCredentialRevocation:
          sharedPending === undefined ? "complete" : "pending_external_disable",
      };
    }

    const currentSyncAccess = await this.vaultSyncGuard.requireSyncAccess(
      params.vaultId,
      unlockedVault,
    );
    const remoteSnapshotDescriptor =
      await this.syncProvider.getLatestVaultSnapshotDescriptor(
        currentSyncAccess,
        params.vaultId,
      );

    if (remoteSnapshotDescriptor === null) {
      throw new RemoteVaultSnapshotNotFoundError(params.vaultId);
    }

    if (
      !areVaultSnapshotDescriptorsEqual(
        remoteSnapshotDescriptor,
        toVaultSnapshotDescriptor(params.vaultId, snapshot),
      )
    ) {
      throw new RemoteVaultSnapshotChangedError(params.vaultId);
    }

    const completedUnlockedVault = {
      ...unlockedVault,
      vault: clearVaultProviderCredentialRevocationPending(unlockedVault.vault),
    };
    const persistedSnapshot =
      await this.unlockedVaultSession.persistForActiveSession(
        sessionId,
        params.vaultId,
        async () =>
          this.vaultSnapshot.persistUnlockedVault(
            params.vaultId,
            completedUnlockedVault,
            sourceSnapshotVersionVector,
            { syncCredentialState: completedState },
          ),
      );

    try {
      await this.syncProvider.uploadVaultSnapshot(
        currentSyncAccess,
        persistedSnapshot.snapshot,
        remoteSnapshotDescriptor,
      );
    } catch (error) {
      await this.unlockedVaultSession.restorePersistedState(
        sessionId,
        params.vaultId,
        async () =>
          this.vaultSnapshot.restoreLocalVaultSnapshot(
            snapshot,
            persistedSnapshot.snapshot,
            unlockedVault,
            encryptedState,
          ),
      );

      if (error instanceof RemoteVaultSnapshotChangedError) {
        throw new SyncConflictDetectedError(params.vaultId);
      }

      throw error;
    }

    await this.unlockedVaultSession.commitPersistedSnapshot(
      sessionId,
      {
        ...completedUnlockedVault,
        trustedSnapshotContext: persistedSnapshot.trustedSnapshotContext,
      },
      persistedSnapshot.snapshotVersionVector,
    );

    return { providerCredentialRevocation: "complete" };
  }
}
