import type { VersionVector } from "../domain/versioning/version-vector.type";

export class PersistedVaultMismatchError extends Error {
  constructor(expectedVaultId: string, actualVaultId: string) {
    super(
      `Cannot persist unlocked vault "${actualVaultId}" as vault "${expectedVaultId}".`,
    );
    this.name = "PersistedVaultMismatchError";
  }
}

export class VaultSnapshotVersionMismatchError extends Error {
  constructor(
    vaultId: string,
    expectedVersionVector: VersionVector,
    actualVersionVector: VersionVector,
  ) {
    super(
      `Vault "${vaultId}" local snapshot version ${JSON.stringify(actualVersionVector)} does not match unlocked session version ${JSON.stringify(expectedVersionVector)}.`,
    );
    this.name = "VaultSnapshotVersionMismatchError";
  }
}

export class SnapshotSigningDeviceNotTrustedError extends Error {
  constructor(vaultId: string, deviceId: string) {
    super(`Device "${deviceId}" is not trusted to sign vault "${vaultId}".`);
    this.name = "SnapshotSigningDeviceNotTrustedError";
  }
}
