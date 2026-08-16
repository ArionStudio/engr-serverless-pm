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
      ["previousCredentials"],
    );
    const currentCredentials = decodeSyncCredentials(record.currentCredentials);
    if (record.previousCredentials === undefined) {
      return { currentCredentials };
    }
    const previous = exactRecord(record.previousCredentials, [
      "credentials",
      "revokedDeviceIds",
      "vaultKeyGeneration",
    ]);
    return {
      currentCredentials,
      previousCredentials: {
        credentials: decodeSyncCredentials(previous.credentials),
        revokedDeviceIds: stringArray(previous.revokedDeviceIds, true),
        vaultKeyGeneration: safeInteger(previous.vaultKeyGeneration, 1),
      },
    };
  } catch {
    throw new InvalidDeviceSyncCredentialStateError();
  }
}

export function encodeDeviceSyncCredentialState(
  value: DeviceSyncCredentialState,
): unknown {
  return {
    currentCredentials: value.currentCredentials,
    ...(value.previousCredentials === undefined
      ? {}
      : { previousCredentials: value.previousCredentials }),
  };
}
