export class DeviceAccessRecoveryBackupNotFoundError extends Error {
  constructor(vaultId: string) {
    super(
      `Device access recovery backup was not found for vault "${vaultId}".`,
    );
    this.name = "DeviceAccessRecoveryBackupNotFoundError";
  }
}

export class DeviceAccessRecoveryBackupMismatchError extends Error {
  constructor(vaultId: string) {
    super(`Device access recovery backup does not match vault "${vaultId}".`);
    this.name = "DeviceAccessRecoveryBackupMismatchError";
  }
}
