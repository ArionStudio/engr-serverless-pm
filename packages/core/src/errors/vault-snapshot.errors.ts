export class PersistedVaultMismatchError extends Error {
  constructor(expectedVaultId: string, actualVaultId: string) {
    super(
      `Cannot persist unlocked vault "${actualVaultId}" as vault "${expectedVaultId}".`,
    );
    this.name = "PersistedVaultMismatchError";
  }
}

export class VaultSnapshotRevisionMismatchError extends Error {
  constructor(params: {
    readonly vaultId: string;
    readonly expectedRevision: number;
    readonly actualRevision: number;
  }) {
    super(
      `Vault "${params.vaultId}" local snapshot revision ${params.actualRevision} does not match unlocked session revision ${params.expectedRevision}.`,
    );
    this.name = "VaultSnapshotRevisionMismatchError";
  }
}

export class DeviceNotTrustedForVaultMutationError extends Error {
  constructor(vaultId: string, deviceId: string) {
    super(`Device "${deviceId}" is not trusted to mutate vault "${vaultId}".`);
    this.name = "DeviceNotTrustedForVaultMutationError";
  }
}
