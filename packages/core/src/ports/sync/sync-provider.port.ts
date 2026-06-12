import type { RemoteVaultSnapshotDescriptor } from "../../domain/sync/remote-vault-snapshot-descriptor.type";
import type { SyncConfig } from "../../domain/sync/sync-config.type";
import type { VaultSnapshot } from "../../domain/snapshot/vault-snapshot";

export interface SyncProviderPort {
  setup: (syncConfig: SyncConfig) => Promise<SyncConfig>;
  getLatestVaultSnapshotDescriptor: (
    syncConfig: SyncConfig,
    vaultId: string,
  ) => Promise<RemoteVaultSnapshotDescriptor | null>;
  downloadVaultSnapshot: (
    syncConfig: SyncConfig,
    descriptor: RemoteVaultSnapshotDescriptor,
  ) => Promise<VaultSnapshot>;
  uploadVaultSnapshot: (
    syncConfig: SyncConfig,
    vaultSnapshot: VaultSnapshot,
    expectedRemoteSnapshotDescriptor: RemoteVaultSnapshotDescriptor | null,
  ) => Promise<void>;
  removeVaultSnapshots: (
    syncConfig: SyncConfig,
    vaultId: string,
  ) => Promise<void>;
}
