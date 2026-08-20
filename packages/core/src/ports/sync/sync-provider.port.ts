import type {
  VaultSnapshotDescriptor,
  VaultSnapshotIdentity,
} from "../../domain/snapshot/vault-snapshot-descriptor.type";
import type {
  SyncAccess,
  SyncSetupInput,
} from "../../domain/sync/sync-config.type";
import type { VaultSnapshot } from "../../domain/snapshot/vault-snapshot";

export type SyncUploadOutcome =
  | { readonly status: "committed" }
  | {
      readonly status: "definitely_not_committed";
      readonly reason: "remote_snapshot_changed" | "provider_rejected";
    }
  | { readonly status: "outcome_unknown" };

export type DefiniteSyncUploadNonCommit = Extract<
  SyncUploadOutcome,
  { readonly status: "definitely_not_committed" }
>;

export type PreparedSyncUpload =
  | {
      readonly status: "ready";
      /**
       * Initiates the remote write synchronously and returns its eventual
       * outcome. Implementations must not perform asynchronous preparation
       * before initiating the write from this callback.
       */
      readonly start: () => { readonly outcome: Promise<SyncUploadOutcome> };
    }
  | {
      readonly status: "not_started";
      readonly outcome: DefiniteSyncUploadNonCommit;
    };

export type PreparedSyncRemoval =
  | {
      readonly status: "ready";
      /** Initiates the remote removal synchronously. */
      readonly start: () => { readonly outcome: Promise<void> };
    }
  | { readonly status: "already_absent" };

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
  /**
   * Performs read-only preparation and returns either a proven non-started
   * outcome or an operation whose synchronous start callback initiates the
   * remote write. Preparation may reject because it cannot have committed.
   * Once start is called, failures must resolve as either a definite non-commit
   * or an outcome-unknown result; a generic rejection must never imply that the
   * write did not commit. Definite non-commit reasons distinguish a remote
   * snapshot change from a proven static provider rejection so callers preserve
   * the established conflict semantics without hiding configuration failures.
   */
  prepareVaultSnapshotUpload: (
    syncAccess: SyncAccess,
    vaultSnapshot: VaultSnapshot,
    expectedRemoteSnapshotIdentity: VaultSnapshotIdentity | null,
  ) => Promise<PreparedSyncUpload>;
  /**
   * Performs read-only preparation for removing remote vault state only when
   * the latest snapshot still matches the expected identity. A null expected
   * identity means that no remote snapshot may exist. A different current
   * identity, including a snapshot appearing when null was expected, must fail
   * with RemoteVaultSnapshotChangedError without removing remote state. The
   * returned start callback initiates removal synchronously. Preparation is
   * idempotent: an already-absent vault returns already_absent.
   */
  prepareVaultSnapshotRemoval: (
    syncAccess: SyncAccess,
    vaultId: string,
    expectedRemoteSnapshotIdentity: VaultSnapshotIdentity | null,
  ) => Promise<PreparedSyncRemoval>;
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
