export class CannotRevokeCurrentDeviceError extends Error {
  constructor(vaultId: string, deviceId: string) {
    super(
      `Cannot revoke current device "${deviceId}" from vault "${vaultId}".`,
    );
    this.name = "CannotRevokeCurrentDeviceError";
  }
}

export class DeviceToRevokeNotTrustedError extends Error {
  constructor(vaultId: string, deviceId: string) {
    super(`Device "${deviceId}" is not trusted in vault "${vaultId}".`);
    this.name = "DeviceToRevokeNotTrustedError";
  }
}

export class DeviceProfileNotFoundForRevocationError extends Error {
  constructor(vaultId: string, deviceId: string) {
    super(
      `Device profile "${deviceId}" was not found for revocation in vault "${vaultId}".`,
    );
    this.name = "DeviceProfileNotFoundForRevocationError";
  }
}
