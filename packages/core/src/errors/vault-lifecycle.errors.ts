export class LocalVaultAlreadyInitializedError extends Error {
  override readonly name = "LocalVaultAlreadyInitializedError";

  constructor(vaultId: string) {
    super(`Local vault "${vaultId}" is already initialized.`);
  }
}
