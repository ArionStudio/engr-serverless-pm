import type { VaultSnapshotDescriptor } from "../../domain/snapshot/vault-snapshot-descriptor.type";
import type {
  SyncAccess,
  SyncSetupInput,
} from "../../domain/sync/sync-config.type";
import type { VaultSnapshot } from "../../domain/snapshot/vault-snapshot";

export interface SyncProviderPort {
  /**
   * Validates and normalizes user-provided sync credentials/configuration for
   * encrypted vault storage. Implementations must not create, update, or delete
   * remote vault state here; remote snapshot changes belong to upload/download/
   * removal operations.
   */
  setup: (syncConfig: SyncSetupInput) => Promise<SyncAccess>;
  getLatestVaultSnapshotDescriptor: (
    syncAccess: SyncAccess,
    vaultId: string,
  ) => Promise<VaultSnapshotDescriptor | null>;
  downloadVaultSnapshot: (
    syncAccess: SyncAccess,
    descriptor: VaultSnapshotDescriptor,
  ) => Promise<VaultSnapshot>;
  uploadVaultSnapshot: (
    syncAccess: SyncAccess,
    vaultSnapshot: VaultSnapshot,
    expectedRemoteSnapshotDescriptor: VaultSnapshotDescriptor | null,
  ) => Promise<void>;
  /**
   * Removes all remote state for a vault. This operation must be idempotent:
   * attempting to remove an already-absent vault is successful.
   */
  removeVaultSnapshots: (
    syncAccess: SyncAccess,
    vaultId: string,
  ) => Promise<void>;
  /**
   * Returns authentication rejection only when the provider definitively
   * rejects the credential. Network, rate-limit, and indeterminate provider
   * failures must reject the promise.
   */
  checkVaultAccess: (
    syncAccess: SyncAccess,
    vaultId: string,
  ) => Promise<"accessible" | "authentication_rejected">;
}
