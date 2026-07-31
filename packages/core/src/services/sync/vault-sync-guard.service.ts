import {
  areVaultSnapshotDescriptorsEqual,
  compareVaultSnapshotDescriptors,
  toVaultSnapshotDescriptor,
} from "../../domain/snapshot/vault-snapshot-descriptor.utils";
import type { VaultSnapshot } from "../../domain/snapshot/vault-snapshot";
import type { VaultSnapshotDescriptor } from "../../domain/snapshot/vault-snapshot-descriptor.type";
import type { UnlockedVault } from "../../domain/session/unlocked-vault";
import type { SyncAccess } from "../../domain/sync/sync-config.type";
import type { VersionVector } from "../../domain/versioning/version-vector.type";
import {
  RemoteVaultSnapshotAheadError,
  RemoteVaultSnapshotChangedError,
  RemoteVaultSnapshotIntegrityError,
  RemoteVaultSnapshotNotFoundError,
  SyncConflictDetectedError,
  LocalSyncCredentialsMissingError,
  ProviderCredentialRevocationPendingError,
  SyncRemovalPendingError,
} from "../../errors/sync.errors";
import type { CryptoPort } from "../../ports/crypto/crypto.port";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import type { VaultLocalRepositoryPort } from "../../ports/vault/vault-local-repository.port";
import type { UnlockedVaultSessionService } from "../session/unlocked-vault-session.service";
import type { VaultSnapshotService } from "../snapshot/vault-snapshot.service";

export class VaultSyncGuardService {
  private readonly syncProvider: SyncProviderPort;
  private readonly vaultSnapshot: VaultSnapshotService;
  private readonly unlockedVaultSession: UnlockedVaultSessionService;
  private readonly crypto: CryptoPort;
  private readonly vaultLocalRepository: VaultLocalRepositoryPort;

  constructor(
    syncProvider: SyncProviderPort,
    vaultSnapshot: VaultSnapshotService,
    unlockedVaultSession: UnlockedVaultSessionService,
    crypto: CryptoPort,
    vaultLocalRepository: VaultLocalRepositoryPort,
  ) {
    this.syncProvider = syncProvider;
    this.vaultSnapshot = vaultSnapshot;
    this.unlockedVaultSession = unlockedVaultSession;
    this.crypto = crypto;
    this.vaultLocalRepository = vaultLocalRepository;
  }

  async requireReadyForLocalMutation(
    vaultId: string,
    unlockedVault: UnlockedVault,
    sourceSnapshotVersionVector: VersionVector,
  ): Promise<VaultSnapshot> {
    return (
      await this.prepareLocalMutation(
        vaultId,
        unlockedVault,
        sourceSnapshotVersionVector,
      )
    ).localSnapshot;
  }

  async prepareLocalMutation(
    vaultId: string,
    unlockedVault: UnlockedVault,
    sourceSnapshotVersionVector: VersionVector,
  ): Promise<{
    readonly localSnapshot: VaultSnapshot;
    readonly syncAccess?: SyncAccess;
    readonly remoteSnapshotDescriptor?: VaultSnapshotDescriptor;
  }> {
    const localSnapshot =
      await this.vaultSnapshot.requireCurrentSnapshotForUnlockedVault(
        vaultId,
        unlockedVault,
        sourceSnapshotVersionVector,
      );
    const syncTarget = unlockedVault.vault.syncTarget;

    if (syncTarget === undefined) {
      return {
        localSnapshot,
      };
    }

    if (unlockedVault.vault.syncRemovalPending === true) {
      throw new SyncRemovalPendingError(vaultId, "modify vault data");
    }

    const syncAccess = await this.requireSyncAccess(vaultId, unlockedVault);
    const remoteSnapshotDescriptor =
      await this.syncProvider.getLatestVaultSnapshotDescriptor(
        syncAccess,
        vaultId,
      );

    if (remoteSnapshotDescriptor === null) {
      throw new RemoteVaultSnapshotNotFoundError(vaultId);
    }

    const localSnapshotDescriptor = toVaultSnapshotDescriptor(
      vaultId,
      localSnapshot,
    );
    const relation = compareVaultSnapshotDescriptors(
      localSnapshotDescriptor,
      remoteSnapshotDescriptor,
    );

    if (relation === "remote_ahead") {
      throw new RemoteVaultSnapshotAheadError(vaultId);
    }

    if (relation === "broken") {
      throw new RemoteVaultSnapshotIntegrityError(vaultId);
    }

    if (
      relation === "equal" &&
      !areVaultSnapshotDescriptorsEqual(
        remoteSnapshotDescriptor,
        localSnapshotDescriptor,
      )
    ) {
      throw new RemoteVaultSnapshotIntegrityError(vaultId);
    }

    return {
      localSnapshot,
      syncAccess,
      remoteSnapshotDescriptor,
    };
  }

  async requireSyncAccess(
    vaultId: string,
    unlockedVault: UnlockedVault,
  ): Promise<SyncAccess> {
    const syncTarget = unlockedVault.vault.syncTarget;

    if (syncTarget === undefined) {
      throw new LocalSyncCredentialsMissingError(vaultId);
    }

    const encryptedState =
      await this.vaultLocalRepository.getDeviceSyncCredentialState(vaultId);

    if (encryptedState === null) {
      throw new LocalSyncCredentialsMissingError(vaultId);
    }

    const state = await this.crypto.decryptDeviceSyncCredentialState(
      encryptedState,
      unlockedVault.deviceLocalProtectionKey,
      {
        vaultId,
        deviceId: unlockedVault.deviceId,
        provider: syncTarget.provider,
        target: syncTarget,
      },
    );

    if (state.currentCredentials.provider !== syncTarget.provider) {
      throw new LocalSyncCredentialsMissingError(vaultId);
    }

    return {
      target: syncTarget,
      credentials: state.currentCredentials,
    };
  }

  async requireProviderCredentialRevocationComplete(
    vaultId: string,
    unlockedVault: UnlockedVault,
    operation: string,
  ): Promise<void> {
    if (unlockedVault.vault.providerCredentialRevocationPending !== undefined) {
      throw new ProviderCredentialRevocationPendingError(vaultId, operation);
    }

    const syncTarget = unlockedVault.vault.syncTarget;

    if (syncTarget === undefined) {
      return;
    }

    const encryptedState =
      await this.vaultLocalRepository.getDeviceSyncCredentialState(vaultId);

    if (encryptedState === null) {
      throw new LocalSyncCredentialsMissingError(vaultId);
    }

    const state = await this.crypto.decryptDeviceSyncCredentialState(
      encryptedState,
      unlockedVault.deviceLocalProtectionKey,
      {
        vaultId,
        deviceId: unlockedVault.deviceId,
        provider: syncTarget.provider,
        target: syncTarget,
      },
    );

    if (state.previousCredentials !== undefined) {
      throw new ProviderCredentialRevocationPendingError(vaultId, operation);
    }
  }

  async uploadPersistedLocalMutation(
    vaultId: string,
    syncState: {
      readonly localSnapshot: VaultSnapshot;
      readonly syncAccess?: SyncAccess;
      readonly remoteSnapshotDescriptor?: VaultSnapshotDescriptor;
    },
    persistedSnapshot: VaultSnapshot,
    unlockedVault: UnlockedVault,
    sessionId: string,
  ): Promise<void> {
    if (
      syncState.syncAccess === undefined ||
      syncState.remoteSnapshotDescriptor === undefined
    ) {
      return;
    }

    try {
      await this.syncProvider.uploadVaultSnapshot(
        syncState.syncAccess,
        persistedSnapshot,
        syncState.remoteSnapshotDescriptor,
      );
    } catch (error) {
      await this.unlockedVaultSession.restorePersistedState(
        sessionId,
        vaultId,
        async () => {
          await this.vaultSnapshot.restoreLocalVaultSnapshot(
            syncState.localSnapshot,
            persistedSnapshot,
            unlockedVault,
          );
        },
      );

      if (error instanceof RemoteVaultSnapshotChangedError) {
        throw new SyncConflictDetectedError(vaultId);
      }

      throw error;
    }
  }

  async uploadPersistedInitialSyncSnapshot(
    vaultId: string,
    syncAccess: SyncAccess,
    localSnapshot: VaultSnapshot,
    persistedSnapshot: VaultSnapshot,
    unlockedVault: UnlockedVault,
    sessionId: string,
  ): Promise<void> {
    try {
      await this.syncProvider.uploadVaultSnapshot(
        syncAccess,
        persistedSnapshot,
        null,
      );
    } catch (error) {
      await this.unlockedVaultSession.restorePersistedState(
        sessionId,
        vaultId,
        async () => {
          await this.vaultSnapshot.restoreLocalVaultSnapshot(
            localSnapshot,
            persistedSnapshot,
            unlockedVault,
            null,
          );
        },
      );

      if (error instanceof RemoteVaultSnapshotChangedError) {
        throw new SyncConflictDetectedError(vaultId);
      }

      throw error;
    }
  }
}
