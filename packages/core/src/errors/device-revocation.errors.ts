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

export class CurrentDeviceRevokedError extends Error {
  constructor(vaultId: string, deviceId: string) {
    super(`Current device "${deviceId}" was revoked from vault "${vaultId}".`);
    this.name = "CurrentDeviceRevokedError";
  }
}

export class InvalidDeviceRevocationTransitionError extends Error {
  override readonly name = "InvalidDeviceRevocationTransitionError";

  constructor(vaultId: string, reason: string) {
    super(`Device revocation for vault "${vaultId}" is invalid: ${reason}.`);
  }
}
