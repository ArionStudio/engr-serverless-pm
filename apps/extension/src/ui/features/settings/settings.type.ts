export type VaultSettingsCapabilities = {
  inspectAuthorization: (vaultId: string) => Promise<void>;
  changePassword: (
    vaultId: string,
    currentPassword: string,
    password: string,
  ) => Promise<void>;
  saveDevice: (
    vaultId: string,
    name: string,
    duration: number,
  ) => Promise<void>;
  removeLocalVault: (vaultId: string) => Promise<void>;
};
