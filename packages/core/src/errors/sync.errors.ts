import type { DeviceKeySlot } from "../domain/snapshot";

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

export class SyncAlreadyConfiguredError extends Error {
  constructor(vaultId: string) {
    super(`Vault "${vaultId}" already has sync configured.`);
    this.name = "SyncAlreadyConfiguredError";
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
    super(`Vault "${vaultId}" has conflicting local and remote sync changes.`);
    this.name = "SyncConflictDetectedError";
  }
}

export class RemoteVaultSnapshotAheadError extends Error {
  constructor(vaultId: string) {
    super(
      `Remote vault snapshot for vault "${vaultId}" has changes that must be downloaded before upload.`,
    );
    this.name = "RemoteVaultSnapshotAheadError";
  }
}

export class LocalVaultSnapshotNotAheadError extends Error {
  constructor(vaultId: string) {
    super(
      `Local vault snapshot for vault "${vaultId}" must be ahead of remote before upload.`,
    );
    this.name = "LocalVaultSnapshotNotAheadError";
  }
}

export class LocalVaultSnapshotAheadError extends Error {
  constructor(vaultId: string) {
    super(
      `Local vault snapshot for vault "${vaultId}" must be uploaded before preparing sync review.`,
    );
    this.name = "LocalVaultSnapshotAheadError";
  }
}

export class RemoteVaultSnapshotIntegrityError extends Error {
  constructor(vaultId: string) {
    super(
      `Vault "${vaultId}" has a broken local/remote snapshot state and cannot be synced automatically.`,
    );
    this.name = "RemoteVaultSnapshotIntegrityError";
  }
}

export class SyncResolutionIncompleteError extends Error {
  constructor(vaultId: string) {
    super(`Vault "${vaultId}" sync resolution is incomplete.`);
    this.name = "SyncResolutionIncompleteError";
  }
}

export class SyncAlreadyResolvedError extends Error {
  constructor(vaultId: string) {
    super(`Vault "${vaultId}" sync resolution has no changes to apply.`);
    this.name = "SyncAlreadyResolvedError";
  }
}

export class InvalidSyncResolutionError extends Error {
  constructor(vaultId: string, cause: unknown) {
    super(`Vault "${vaultId}" sync resolution is invalid.`, { cause });
    this.name = "InvalidSyncResolutionError";
  }
}

export class InvalidVaultSyncResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidVaultSyncResolutionError";
  }
}

export class InvalidVaultSyncReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidVaultSyncReviewError";
  }
}

export class ChangedDeviceKeySlotsError extends Error {
  readonly changedDeviceIds: readonly string[];
  readonly changedDeviceSlots: readonly {
    readonly deviceId: string;
    readonly localDeviceSlot: DeviceKeySlot;
    readonly remoteDeviceSlot: DeviceKeySlot;
  }[];

  constructor(
    changedDeviceSlots: readonly {
      readonly deviceId: string;
      readonly localDeviceSlot: DeviceKeySlot;
      readonly remoteDeviceSlot: DeviceKeySlot;
    }[],
  ) {
    super("Device key slots changed between local and remote snapshots.");
    this.name = "ChangedDeviceKeySlotsError";
    this.changedDeviceIds = changedDeviceSlots.map(
      (changedDeviceSlot) => changedDeviceSlot.deviceId,
    );
    this.changedDeviceSlots = changedDeviceSlots;
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
