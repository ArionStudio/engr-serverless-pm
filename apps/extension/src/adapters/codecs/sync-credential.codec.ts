import type {
  DeviceSyncCredentialState,
  EncryptedDeviceSyncCredentialState,
} from "@lfspm/core";
import {
  StaticArtifactError,
  decodeEncrypted,
  decodeJsonValue,
  encodeEncrypted,
  exactRecord,
  safeInteger,
  stringArray,
} from "./artifact-codec.primitives";
import { decodeVaultSnapshotIdentity } from "./vault-snapshot.codec";

export class InvalidSyncCredentialRecordError extends StaticArtifactError {
  constructor() {
    super(
      "InvalidSyncCredentialRecordError",
      "Sync credential record is malformed.",
    );
  }
}

export class InvalidDeviceSyncCredentialStateError extends StaticArtifactError {
  constructor() {
    super(
      "InvalidDeviceSyncCredentialStateError",
      "Device sync credential state is malformed.",
    );
  }
}

export function decodeEncryptedDeviceSyncCredentialState(
  value: unknown,
): EncryptedDeviceSyncCredentialState {
  try {
    return decodeEncrypted(value);
  } catch {
    throw new InvalidSyncCredentialRecordError();
  }
}

export function encodeEncryptedDeviceSyncCredentialState(
  value: EncryptedDeviceSyncCredentialState,
): unknown {
  return encodeEncrypted(value);
}

function decodeSyncCredentials(value: unknown) {
  const record = exactRecord(value, ["provider", "credentialsConfig"]);
  if (record.provider !== "aws-s3-v1") {
    throw new Error("provider");
  }
  return {
    provider: "aws-s3-v1" as const,
    credentialsConfig: decodeJsonValue(
      record.credentialsConfig,
    ) as DeviceSyncCredentialState["currentCredentials"]["credentialsConfig"],
  };
}

export function decodeDeviceSyncCredentialState(
  value: unknown,
): DeviceSyncCredentialState {
  try {
    const record = exactRecord(
      value,
      ["currentCredentials"],
      ["pendingSnapshotUpload", "previousCredentials"],
    );
    const currentCredentials = decodeSyncCredentials(record.currentCredentials);
    const pendingSnapshotUpload =
      record.pendingSnapshotUpload === undefined
        ? undefined
        : decodePendingSnapshotUpload(record.pendingSnapshotUpload);
    const previousCredentials =
      record.previousCredentials === undefined
        ? undefined
        : decodePreviousCredentials(record.previousCredentials);

    return {
      currentCredentials,
      ...(pendingSnapshotUpload === undefined ? {} : { pendingSnapshotUpload }),
      ...(previousCredentials === undefined ? {} : { previousCredentials }),
    };
  } catch {
    throw new InvalidDeviceSyncCredentialStateError();
  }
}

function decodePendingSnapshotUpload(
  value: unknown,
): NonNullable<DeviceSyncCredentialState["pendingSnapshotUpload"]> {
  const record = exactRecord(value, [
    "candidateSnapshotIdentity",
    "expectedRemoteSnapshotIdentity",
  ]);

  return {
    candidateSnapshotIdentity: decodeVaultSnapshotIdentity(
      record.candidateSnapshotIdentity,
    ),
    expectedRemoteSnapshotIdentity:
      record.expectedRemoteSnapshotIdentity === null
        ? null
        : decodeVaultSnapshotIdentity(record.expectedRemoteSnapshotIdentity),
  };
}

function decodePreviousCredentials(
  value: unknown,
): NonNullable<DeviceSyncCredentialState["previousCredentials"]> {
  const previous = exactRecord(value, [
    "credentials",
    "revokedDeviceIds",
    "vaultKeyGeneration",
  ]);

  return {
    credentials: decodeSyncCredentials(previous.credentials),
    revokedDeviceIds: stringArray(previous.revokedDeviceIds, true),
    vaultKeyGeneration: safeInteger(previous.vaultKeyGeneration, 1),
  };
}

export function encodeDeviceSyncCredentialState(
  value: DeviceSyncCredentialState,
): unknown {
  return decodeDeviceSyncCredentialState(value);
}
