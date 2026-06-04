import { VaultMustBeUnlockedError } from "./vault-session.errors";

export class VaultMustBeUnlockedForMasterPasswordChangeError extends VaultMustBeUnlockedError {
  constructor(vaultId: string) {
    super(vaultId, "master password change");
    this.name = "VaultMustBeUnlockedForMasterPasswordChangeError";
  }
}

export class DeviceAccessMaterialNotFoundForMasterPasswordChangeError extends Error {
  constructor(vaultId: string) {
    super(`Device access material was not found for vault "${vaultId}".`);
    this.name = "DeviceAccessMaterialNotFoundForMasterPasswordChangeError";
  }
}
