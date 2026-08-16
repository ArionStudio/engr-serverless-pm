import type {
  DeviceAccessMaterial,
  DeviceAccessRecoveryBackup,
  DeviceLocalProtectionKey,
  DevicePrivateSignKey,
  DevicePublicSignKey,
  DeviceVaultPrivateKey,
  DeviceVaultPublicKey,
  LocalKeysPayload,
  LocalVaultDescriptor,
  LocalVaultTrustCheckpoint,
  RandomBytes,
} from "@lfspm/core";
import { bestEffortWipeArrayBuffers } from "@lfspm/core/lib";
import {
  StaticArtifactError,
  canonicalDigest,
  decodeCanonicalBytes,
  decodeSignature,
  decodeVersionVector,
  decodeWrapped,
  encodeBytes,
  encodeSignature,
  encodeVersionVector,
  encodeWrapped,
  exactRecord,
  nonBlankString,
  safeInteger,
} from "./artifact-codec.primitives";
import { decodeTrustAnchor, encodeTrustAnchor } from "./vault-snapshot.codec";

export class InvalidLocalVaultSecurityRecordError extends StaticArtifactError {
  constructor() {
    super(
      "InvalidLocalVaultSecurityRecordError",
      "Local vault security record is malformed.",
    );
  }
}

export class InvalidLocalKeysPayloadError extends StaticArtifactError {
  constructor() {
    super("InvalidLocalKeysPayloadError", "Local keys payload is malformed.");
  }
}

export function decodeLocalVaultDescriptor(
  value: unknown,
): LocalVaultDescriptor {
  try {
    const record = exactRecord(
      value,
      ["vaultId", "displayName", "createdAt"],
      ["lastUnlockedAt"],
    );
    return {
      vaultId: nonBlankString(record.vaultId),
      displayName: nonBlankString(record.displayName),
      createdAt: safeInteger(record.createdAt),
      ...(Object.hasOwn(record, "lastUnlockedAt")
        ? { lastUnlockedAt: safeInteger(record.lastUnlockedAt) }
        : {}),
    };
  } catch {
    throw new InvalidLocalVaultSecurityRecordError();
  }
}

export function encodeLocalVaultDescriptor(
  value: LocalVaultDescriptor,
): unknown {
  return { ...value };
}

function decodeAccessCommon(value: unknown, recovery: boolean) {
  const saltKey = recovery
    ? "recoveryLocalKeysProtectionSalt"
    : "masterPasswordSalt";
  const required = [
    "revision",
    "localAccessGenerationId",
    "vaultId",
    "deviceId",
    "algorithmSuiteId",
    saltKey,
    ...(recovery ? [] : ["localKeysProtectionSalt"]),
    "devicePublicSignKey",
    "devicePublicVaultKey",
    "protectedLocalKeys",
  ];
  const record = exactRecord(value, required);
  return {
    revision: safeInteger(record.revision, 1),
    localAccessGenerationId: nonBlankString(record.localAccessGenerationId),
    vaultId: nonBlankString(record.vaultId),
    deviceId: nonBlankString(record.deviceId),
    algorithmSuiteId: nonBlankString(record.algorithmSuiteId),
    salt: decodeCanonicalBytes<RandomBytes>(record[saltKey], 32),
    localKeysProtectionSalt: recovery
      ? undefined
      : decodeCanonicalBytes<RandomBytes>(record.localKeysProtectionSalt, 32),
    devicePublicSignKey: decodeCanonicalBytes<DevicePublicSignKey>(
      record.devicePublicSignKey,
      32,
    ),
    devicePublicVaultKey: decodeCanonicalBytes<DeviceVaultPublicKey>(
      record.devicePublicVaultKey,
      65,
    ),
    protectedLocalKeys: decodeWrapped<LocalKeysPayload>(
      record.protectedLocalKeys,
    ),
  };
}

export function decodeDeviceAccessMaterial(
  value: unknown,
): DeviceAccessMaterial {
  try {
    const decoded = decodeAccessCommon(value, false);
    return {
      revision: decoded.revision,
      localAccessGenerationId: decoded.localAccessGenerationId,
      vaultId: decoded.vaultId,
      deviceId: decoded.deviceId,
      algorithmSuiteId: decoded.algorithmSuiteId,
      masterPasswordSalt: decoded.salt,
      localKeysProtectionSalt: decoded.localKeysProtectionSalt as RandomBytes,
      devicePublicSignKey: decoded.devicePublicSignKey,
      devicePublicVaultKey: decoded.devicePublicVaultKey,
      protectedLocalKeys: decoded.protectedLocalKeys,
    };
  } catch {
    throw new InvalidLocalVaultSecurityRecordError();
  }
}

export function encodeDeviceAccessMaterial(
  value: DeviceAccessMaterial,
): unknown {
  return {
    ...value,
    masterPasswordSalt: encodeBytes(value.masterPasswordSalt),
    localKeysProtectionSalt: encodeBytes(value.localKeysProtectionSalt),
    devicePublicSignKey: encodeBytes(value.devicePublicSignKey),
    devicePublicVaultKey: encodeBytes(value.devicePublicVaultKey),
    protectedLocalKeys: encodeWrapped(value.protectedLocalKeys),
  };
}

export function decodeDeviceAccessRecoveryBackup(
  value: unknown,
): DeviceAccessRecoveryBackup {
  try {
    const decoded = decodeAccessCommon(value, true);
    return {
      revision: decoded.revision,
      localAccessGenerationId: decoded.localAccessGenerationId,
      vaultId: decoded.vaultId,
      deviceId: decoded.deviceId,
      algorithmSuiteId: decoded.algorithmSuiteId,
      recoveryLocalKeysProtectionSalt: decoded.salt,
      devicePublicSignKey: decoded.devicePublicSignKey,
      devicePublicVaultKey: decoded.devicePublicVaultKey,
      protectedLocalKeys: decoded.protectedLocalKeys,
    };
  } catch {
    throw new InvalidLocalVaultSecurityRecordError();
  }
}

export function encodeDeviceAccessRecoveryBackup(
  value: DeviceAccessRecoveryBackup,
): unknown {
  return {
    ...value,
    recoveryLocalKeysProtectionSalt: encodeBytes(
      value.recoveryLocalKeysProtectionSalt,
    ),
    devicePublicSignKey: encodeBytes(value.devicePublicSignKey),
    devicePublicVaultKey: encodeBytes(value.devicePublicVaultKey),
    protectedLocalKeys: encodeWrapped(value.protectedLocalKeys),
  };
}

export function decodeLocalVaultTrustCheckpoint(
  value: unknown,
): LocalVaultTrustCheckpoint {
  try {
    const record = exactRecord(value, ["payload", "signature"]);
    const payload = exactRecord(record.payload, [
      "version",
      "vaultId",
      "deviceId",
      "trustGeneration",
      "trustCertificateDigest",
      "vaultKeyGeneration",
      "snapshotVersionVector",
      "snapshotDigest",
    ]);
    if (payload.version !== 1) {
      throw new Error("version");
    }
    return {
      payload: {
        version: 1,
        vaultId: nonBlankString(payload.vaultId),
        deviceId: nonBlankString(payload.deviceId),
        trustGeneration: safeInteger(payload.trustGeneration),
        trustCertificateDigest: canonicalDigest(payload.trustCertificateDigest),
        vaultKeyGeneration: safeInteger(payload.vaultKeyGeneration, 1),
        snapshotVersionVector: decodeVersionVector(
          payload.snapshotVersionVector,
        ),
        snapshotDigest: canonicalDigest(payload.snapshotDigest),
      },
      signature: decodeSignature(record.signature),
    };
  } catch {
    throw new InvalidLocalVaultSecurityRecordError();
  }
}

export function encodeLocalVaultTrustCheckpoint(
  value: LocalVaultTrustCheckpoint,
): unknown {
  return {
    payload: {
      ...value.payload,
      snapshotVersionVector: encodeVersionVector(
        value.payload.snapshotVersionVector,
      ),
    },
    signature: encodeSignature(value.signature),
  };
}

export function decodeLocalKeysPayload(value: unknown): LocalKeysPayload {
  let devicePrivateSignKey: DevicePrivateSignKey | undefined;
  let devicePrivateVaultKey: DeviceVaultPrivateKey | undefined;
  let deviceLocalProtectionKey: DeviceLocalProtectionKey | undefined;
  try {
    const record = exactRecord(value, [
      "devicePrivateSignKey",
      "devicePrivateVaultKey",
      "deviceLocalProtectionKey",
      "vaultTrustAnchor",
    ]);
    devicePrivateSignKey = decodeCanonicalBytes<DevicePrivateSignKey>(
      record.devicePrivateSignKey,
    );
    devicePrivateVaultKey = decodeCanonicalBytes<DeviceVaultPrivateKey>(
      record.devicePrivateVaultKey,
    );
    deviceLocalProtectionKey = decodeCanonicalBytes<DeviceLocalProtectionKey>(
      record.deviceLocalProtectionKey,
      32,
    );
    return {
      devicePrivateSignKey,
      devicePrivateVaultKey,
      deviceLocalProtectionKey,
      vaultTrustAnchor: decodeTrustAnchor(record.vaultTrustAnchor),
    };
  } catch {
    bestEffortWipeArrayBuffers([
      devicePrivateSignKey,
      devicePrivateVaultKey,
      deviceLocalProtectionKey,
    ]);
    throw new InvalidLocalKeysPayloadError();
  }
}

export function encodeLocalKeysPayload(value: LocalKeysPayload): unknown {
  return {
    devicePrivateSignKey: encodeBytes(value.devicePrivateSignKey),
    devicePrivateVaultKey: encodeBytes(value.devicePrivateVaultKey),
    deviceLocalProtectionKey: encodeBytes(value.deviceLocalProtectionKey),
    vaultTrustAnchor: encodeTrustAnchor(value.vaultTrustAnchor),
  };
}
