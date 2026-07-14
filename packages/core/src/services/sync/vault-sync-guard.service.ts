import {
  areVaultSnapshotDescriptorsEqual,
  compareVaultSnapshotDescriptors,
  toVaultSnapshotDescriptor,
} from "../../domain/snapshot/vault-snapshot-descriptor.utils";
import type { VaultSnapshot } from "../../domain/snapshot/vault-snapshot";
import type { VaultSnapshotDescriptor } from "../../domain/snapshot/vault-snapshot-descriptor.type";
import type { UnlockedVault } from "../../domain/session/unlocked-vault";
import type { SyncConfig } from "../../domain/sync/sync-config.type";
import type { VersionVector } from "../../domain/versioning/version-vector.type";
import {
  RemoteVaultSnapshotAheadError,
  RemoteVaultSnapshotChangedError,
  RemoteVaultSnapshotIntegrityError,
  RemoteVaultSnapshotNotFoundError,
  SyncConflictDetectedError,
} from "../../errors/sync.errors";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import type { VaultSnapshotService } from "../snapshot/vault-snapshot.service";

export class VaultSyncGuardService {
  private readonly syncProvider: SyncProviderPort;
  private readonly vaultSnapshot: VaultSnapshotService;

  constructor(
    syncProvider: SyncProviderPort,
    vaultSnapshot: VaultSnapshotService,
  ) {
    this.syncProvider = syncProvider;
    this.vaultSnapshot = vaultSnapshot;
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
    readonly syncConfig?: SyncConfig;
    readonly remoteSnapshotDescriptor?: VaultSnapshotDescriptor;
  }> {
    const localSnapshot =
      await this.vaultSnapshot.requireCurrentSnapshotForUnlockedVault(
        vaultId,
        unlockedVault,
        sourceSnapshotVersionVector,
      );
    const syncConfig = unlockedVault.vault.syncConfig;

    if (syncConfig === undefined) {
      return {
        localSnapshot,
      };
    }

    const remoteSnapshotDescriptor =
      await this.syncProvider.getLatestVaultSnapshotDescriptor(
        syncConfig,
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
      syncConfig,
      remoteSnapshotDescriptor,
    };
  }

  async uploadPersistedLocalMutation(
    vaultId: string,
    syncState: {
      readonly localSnapshot: VaultSnapshot;
      readonly syncConfig?: SyncConfig;
      readonly remoteSnapshotDescriptor?: VaultSnapshotDescriptor;
    },
    persistedSnapshot: VaultSnapshot,
    unlockedVault: UnlockedVault,
  ): Promise<void> {
    if (
      syncState.syncConfig === undefined ||
      syncState.remoteSnapshotDescriptor === undefined
    ) {
      return;
    }

    try {
      await this.syncProvider.uploadVaultSnapshot(
        syncState.syncConfig,
        persistedSnapshot,
        syncState.remoteSnapshotDescriptor,
      );
    } catch (error) {
      try {
        await this.vaultSnapshot.restoreLocalVaultSnapshot(
          syncState.localSnapshot,
          persistedSnapshot,
          unlockedVault,
        );
      } catch {
        // Preserve the upload failure as the root cause.
      }

      if (error instanceof RemoteVaultSnapshotChangedError) {
        throw new SyncConflictDetectedError(vaultId);
      }

      throw error;
    }
  }

  async uploadPersistedInitialSyncSnapshot(
    vaultId: string,
    syncConfig: SyncConfig,
    localSnapshot: VaultSnapshot,
    persistedSnapshot: VaultSnapshot,
    unlockedVault: UnlockedVault,
  ): Promise<void> {
    try {
      await this.syncProvider.uploadVaultSnapshot(
        syncConfig,
        persistedSnapshot,
        null,
      );
    } catch (error) {
      try {
        await this.vaultSnapshot.restoreLocalVaultSnapshot(
          localSnapshot,
          persistedSnapshot,
          unlockedVault,
        );
      } catch {
        // Preserve the upload failure as the root cause.
      }

      if (error instanceof RemoteVaultSnapshotChangedError) {
        throw new SyncConflictDetectedError(vaultId);
      }

      throw error;
    }
  }
}
