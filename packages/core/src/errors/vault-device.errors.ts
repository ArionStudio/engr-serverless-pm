export class DuplicateVaultDeviceProfileError extends Error {
  public readonly deviceId: string;

  constructor(deviceId: string) {
    super(`Device profile "${deviceId}" already exists.`);
    this.name = "DuplicateVaultDeviceProfileError";
    this.deviceId = deviceId;
    Object.setPrototypeOf(this, DuplicateVaultDeviceProfileError.prototype);
  }
}

export class DeviceAccessMaterialIdentityMismatchError extends Error {
  override readonly name = "DeviceAccessMaterialIdentityMismatchError";

  constructor(vaultId: string) {
    super(
      `Device access material does not match the expected identity for vault "${vaultId}".`,
    );
  }
}

export class DeviceAccessMaterialChangedError extends Error {
  override readonly name = "DeviceAccessMaterialChangedError";

  constructor(vaultId: string) {
    super(`Device access material for vault "${vaultId}" changed before save.`);
  }
}
