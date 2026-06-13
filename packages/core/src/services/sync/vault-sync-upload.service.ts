import {
  areRemoteVaultSnapshotDescriptorsEqual,
  compareLocalAndRemoteSnapshotDescriptors,
  toRemoteVaultSnapshotDescriptor,
} from "../../domain/sync/vault-snapshot-version.utils";
import type { RemoteVaultSnapshotDescriptor } from "../../domain/sync/remote-vault-snapshot-descriptor.type";
import type { SyncConfig } from "../../domain/sync/sync-config.type";
import type { VaultSnapshot } from "../../domain/snapshot/vault-snapshot";
import type { Vault } from "../../domain/vault/vault";
import type { SyncProviderPort } from "../../ports/sync/sync-provider.port";
import {
  RemoteVaultSnapshotAheadError,
  RemoteVaultSnapshotChangedError,
  SyncConflictDetectedError,
} from "../errors/sync.errors";

export type UploadLocalSnapshotIfAllowedParams = {
  readonly vaultId: string;
  readonly syncConfig: SyncConfig;
  readonly localVault: Vault;
  readonly localSnapshot: VaultSnapshot;
};

export type UploadSnapshotWithExpectedDescriptorParams = {
  readonly vaultId: string;
  readonly syncConfig: SyncConfig;
  readonly vaultSnapshot: VaultSnapshot;
  readonly expectedRemoteSnapshotDescriptor: RemoteVaultSnapshotDescriptor | null;
};

export class VaultSyncUploadService {
  private readonly syncProvider: SyncProviderPort;

  constructor(syncProvider: SyncProviderPort) {
    this.syncProvider = syncProvider;
  }

  async uploadLocalSnapshotIfAllowed(
    params: UploadLocalSnapshotIfAllowedParams,
  ): Promise<void> {
    const remoteSnapshotDescriptor =
      await this.syncProvider.getLatestVaultSnapshotDescriptor(
        params.syncConfig,
        params.vaultId,
      );

    if (remoteSnapshotDescriptor === null) {
      await this.uploadSnapshotWithExpectedDescriptor({
        vaultId: params.vaultId,
        syncConfig: params.syncConfig,
        vaultSnapshot: params.localSnapshot,
        expectedRemoteSnapshotDescriptor: null,
      });
      return;
    }

    const localSnapshotDescriptor = toRemoteVaultSnapshotDescriptor(
      params.localSnapshot.metadata.id,
      params.localVault,
      params.localSnapshot,
    );
    const relation = compareLocalAndRemoteSnapshotDescriptors(
      localSnapshotDescriptor,
      remoteSnapshotDescriptor,
    );

    if (
      relation === "equal" &&
      areRemoteVaultSnapshotDescriptorsEqual(
        remoteSnapshotDescriptor,
        localSnapshotDescriptor,
      )
    ) {
      return;
    }

    if (relation === "equal" || relation === "remote_ahead") {
      throw new RemoteVaultSnapshotAheadError(params.vaultId);
    }

    if (relation === "diverged") {
      throw new SyncConflictDetectedError(params.vaultId);
    }

    if (relation === "local_ahead") {
      await this.uploadSnapshotWithExpectedDescriptor({
        vaultId: params.vaultId,
        syncConfig: params.syncConfig,
        vaultSnapshot: params.localSnapshot,
        expectedRemoteSnapshotDescriptor: remoteSnapshotDescriptor,
      });
    }
  }

  async uploadSnapshotWithExpectedDescriptor(
    params: UploadSnapshotWithExpectedDescriptorParams,
  ): Promise<void> {
    try {
      await this.syncProvider.uploadVaultSnapshot(
        params.syncConfig,
        params.vaultSnapshot,
        params.expectedRemoteSnapshotDescriptor,
      );
    } catch (error) {
      if (error instanceof RemoteVaultSnapshotChangedError) {
        throw new SyncConflictDetectedError(params.vaultId);
      }

      throw error;
    }
  }
}
