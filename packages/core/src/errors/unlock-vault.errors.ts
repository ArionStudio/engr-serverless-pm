export class DeviceAccessMaterialNotFoundError extends Error {
  constructor(vaultId: string) {
    super(`Device access material was not found for vault "${vaultId}".`);
    this.name = "DeviceAccessMaterialNotFoundError";
  }
}

export class VaultSnapshotNotFoundError extends Error {
  constructor(vaultId: string) {
    super(`Vault snapshot was not found for vault "${vaultId}".`);
    this.name = "VaultSnapshotNotFoundError";
  }
}

export class VaultSnapshotSignatureVerificationFailedError extends Error {
  constructor(vaultId: string) {
    super(
      `Vault snapshot signature verification failed for vault "${vaultId}".`,
    );
    this.name = "VaultSnapshotSignatureVerificationFailedError";
  }
}

export class VaultSnapshotSignerNotTrustedError extends Error {
  constructor(vaultId: string, signerDeviceId: string) {
    super(
      `Vault snapshot signer "${signerDeviceId}" is not trusted for vault "${vaultId}".`,
    );
    this.name = "VaultSnapshotSignerNotTrustedError";
  }
}

export class DeviceKeySlotNotFoundError extends Error {
  constructor(vaultId: string, deviceId: string) {
    super(
      `Device key slot was not found for device "${deviceId}" in vault "${vaultId}".`,
    );
    this.name = "DeviceKeySlotNotFoundError";
  }
}

export class DeviceKeySlotVerificationFailedError extends Error {
  constructor(vaultId: string, deviceId: string) {
    super(
      `Device key slot verification failed for device "${deviceId}" in vault "${vaultId}".`,
    );
    this.name = "DeviceKeySlotVerificationFailedError";
  }
}
