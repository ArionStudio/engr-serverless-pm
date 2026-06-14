export class DuplicateVaultDeviceProfileError extends Error {
  public readonly deviceId: string;

  constructor(deviceId: string) {
    super(`Device profile "${deviceId}" already exists.`);
    this.name = "DuplicateVaultDeviceProfileError";
    this.deviceId = deviceId;
    Object.setPrototypeOf(this, DuplicateVaultDeviceProfileError.prototype);
  }
}
