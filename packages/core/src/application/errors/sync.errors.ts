export class InvalidSyncConfigError extends Error {
  constructor(cause: unknown) {
    super("Sync configuration is invalid.", { cause });
    this.name = "InvalidSyncConfigError";
  }
}

export class SyncNotConfiguredError extends Error {
  constructor(vaultId: string, operation: string) {
    super(`Vault "${vaultId}" must have sync configured before ${operation}.`);
    this.name = "SyncNotConfiguredError";
  }
}

export class RemoteVaultSnapshotNotFoundError extends Error {
  constructor(vaultId: string) {
    super(`Remote vault snapshot for vault "${vaultId}" was not found.`);
    this.name = "RemoteVaultSnapshotNotFoundError";
  }
}

export class SyncConflictDetectedError extends Error {
  constructor(vaultId: string) {
    super(`Vault "${vaultId}" has diverged local and remote changes.`);
    this.name = "SyncConflictDetectedError";
  }
}

export class RemoteVaultSnapshotAheadError extends Error {
  constructor(vaultId: string) {
    super(
      `Remote vault snapshot for vault "${vaultId}" must be resolved before upload.`,
    );
    this.name = "RemoteVaultSnapshotAheadError";
  }
}

export class SyncResolutionIncompleteError extends Error {
  constructor(vaultId: string) {
    super(`Vault "${vaultId}" sync resolution is incomplete.`);
    this.name = "SyncResolutionIncompleteError";
  }
}

export class InvalidSyncResolutionError extends Error {
  constructor(vaultId: string, cause: unknown) {
    super(`Vault "${vaultId}" sync resolution is invalid.`, { cause });
    this.name = "InvalidSyncResolutionError";
  }
}

export class SyncTrustChangeRequiresDeviceTrustFlowError extends Error {
  constructor(vaultId: string) {
    super(
      `Vault "${vaultId}" has device trust changes that must be handled by the device trust flow.`,
    );
    this.name = "SyncTrustChangeRequiresDeviceTrustFlowError";
  }
}

export class RemoteVaultSnapshotChangedError extends Error {
  constructor(vaultId: string) {
    super(`Remote vault snapshot for vault "${vaultId}" changed during sync.`);
    this.name = "RemoteVaultSnapshotChangedError";
  }
}
