export class VaultTrustStateInvalidError extends Error {
  override readonly name = "VaultTrustStateInvalidError";

  constructor(vaultId: string, reason: string) {
    super(`Vault trust state for vault '${vaultId}' is invalid: ${reason}.`);
  }
}

export class LocalVaultTrustCheckpointNotFoundError extends Error {
  override readonly name = "LocalVaultTrustCheckpointNotFoundError";

  constructor(vaultId: string) {
    super(`Local vault trust checkpoint for vault '${vaultId}' was not found.`);
  }
}

export class LocalVaultTrustCheckpointInvalidError extends Error {
  override readonly name = "LocalVaultTrustCheckpointInvalidError";

  constructor(vaultId: string, reason: string) {
    super(
      `Local vault trust checkpoint for vault '${vaultId}' is invalid: ${reason}.`,
    );
  }
}

export class VaultSnapshotRollbackDetectedError extends Error {
  override readonly name = "VaultSnapshotRollbackDetectedError";

  constructor(vaultId: string) {
    super(`Vault snapshot rollback was detected for vault '${vaultId}'.`);
  }
}
