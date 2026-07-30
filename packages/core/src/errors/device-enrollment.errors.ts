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

export class DeviceEnrollmentIntegrityError extends Error {
  constructor(vaultId: string, reason: string, options?: ErrorOptions) {
    super(
      `Vault "${vaultId}" device enrollment integrity check failed: ${reason}`,
      options,
    );
    this.name = "DeviceEnrollmentIntegrityError";
  }
}

export class PendingDeviceEnrollmentNotFoundError extends Error {
  override readonly name = "PendingDeviceEnrollmentNotFoundError";

  constructor(requestId: string) {
    super(`Pending device enrollment request "${requestId}" was not found.`);
  }
}

export class PendingDeviceEnrollmentMismatchError extends Error {
  override readonly name = "PendingDeviceEnrollmentMismatchError";

  constructor(requestId: string) {
    super(`Pending device enrollment request "${requestId}" does not match.`);
  }
}

export class DeviceEnrollmentSyncCredentialsRequiredError extends Error {
  override readonly name = "DeviceEnrollmentSyncCredentialsRequiredError";

  constructor(vaultId: string) {
    super(
      `Local sync credentials are required to enroll a device into vault "${vaultId}".`,
    );
  }
}
