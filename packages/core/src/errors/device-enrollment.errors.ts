export class DeviceEnrollmentSnapshotMismatchError extends Error {
  constructor(vaultId: string, actualVaultId: string) {
    super(
      `Device enrollment expected vault "${vaultId}" but downloaded snapshot belongs to vault "${actualVaultId}".`,
    );
    this.name = "DeviceEnrollmentSnapshotMismatchError";
  }
}

export class DeviceEnrollmentVaultNotSynchronizedError extends Error {
  constructor(vaultId: string) {
    super(
      `Vault "${vaultId}" must match the remote snapshot before enrollment.`,
    );
    this.name = "DeviceEnrollmentVaultNotSynchronizedError";
  }
}

export class DeviceEnrollmentRemoteSnapshotChangedError extends Error {
  constructor(vaultId: string) {
    super(
      `Vault "${vaultId}" enrollment snapshot changed before device enrollment. Start enrollment again.`,
    );
    this.name = "DeviceEnrollmentRemoteSnapshotChangedError";
  }
}

export class DeviceEnrollmentKeySlotNotFoundError extends Error {
  constructor(vaultId: string) {
    super(`Vault "${vaultId}" does not have an active enrollment key slot.`);
    this.name = "DeviceEnrollmentKeySlotNotFoundError";
  }
}

export class DeviceEnrollmentAlreadyCompletedError extends Error {
  constructor(vaultId: string, enrollmentId: string) {
    super(
      `Vault "${vaultId}" device enrollment "${enrollmentId}" is already completed.`,
    );
    this.name = "DeviceEnrollmentAlreadyCompletedError";
  }
}

export class DeviceEnrollmentIntegrityError extends Error {
  constructor(vaultId: string, reason: string) {
    super(
      `Vault "${vaultId}" device enrollment integrity check failed: ${reason}`,
    );
    this.name = "DeviceEnrollmentIntegrityError";
  }
}
