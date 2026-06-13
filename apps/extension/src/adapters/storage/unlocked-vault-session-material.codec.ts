import {
  decodeBase64Url,
  encodeBase64Url,
  type Base64URLString,
} from "@lfspm/core/lib";
import type {
  DevicePrivateSignKey,
  UnlockedVaultSessionMaterial,
  UnlockedVaultSessionPayloadKey,
  VaultMasterKey,
} from "@lfspm/core";

export type StoredUnlockedVaultSessionMaterial = {
  sessionId: string;
  vaultId: string;
  sourceSnapshotRevision: number;
  deviceId: string;
  vaultMasterKey: Base64URLString;
  devicePrivateSignKey: Base64URLString;
  payloadKey: Base64URLString;
};

export function serializeUnlockedVaultSessionMaterial(
  material: UnlockedVaultSessionMaterial,
): StoredUnlockedVaultSessionMaterial {
  return {
    sessionId: material.sessionId,
    vaultId: material.vaultId,
    sourceSnapshotRevision: material.sourceSnapshotRevision,
    deviceId: material.deviceId,
    vaultMasterKey: arrayBufferToBase64Url(material.vaultMasterKey),
    devicePrivateSignKey: arrayBufferToBase64Url(material.devicePrivateSignKey),
    payloadKey: arrayBufferToBase64Url(material.payloadKey),
  };
}

export function deserializeUnlockedVaultSessionMaterial(
  material: unknown,
): UnlockedVaultSessionMaterial {
  assertStoredMaterial(material);

  return {
    sessionId: material.sessionId,
    vaultId: material.vaultId,
    sourceSnapshotRevision: material.sourceSnapshotRevision,
    deviceId: material.deviceId,
    vaultMasterKey: base64UrlToArrayBuffer(
      material.vaultMasterKey,
    ) as VaultMasterKey,
    devicePrivateSignKey: base64UrlToArrayBuffer(
      material.devicePrivateSignKey,
    ) as DevicePrivateSignKey,
    payloadKey: base64UrlToArrayBuffer(
      material.payloadKey,
    ) as UnlockedVaultSessionPayloadKey,
  };
}

function arrayBufferToBase64Url(buffer: ArrayBuffer): Base64URLString {
  return encodeBase64Url(new Uint8Array(buffer));
}

function base64UrlToArrayBuffer(value: Base64URLString): ArrayBuffer {
  const bytes = decodeBase64Url(value);
  return bytes.slice().buffer;
}

function assertStoredMaterial(
  material: unknown,
): asserts material is StoredUnlockedVaultSessionMaterial {
  if (!isRecord(material)) {
    throw new Error("Unlocked vault session material is malformed.");
  }

  assertStringField(material, "sessionId");
  assertStringField(material, "vaultId");
  assertNumberField(material, "sourceSnapshotRevision");
  assertStringField(material, "deviceId");
  assertStringField(material, "vaultMasterKey");
  assertStringField(material, "devicePrivateSignKey");
  assertStringField(material, "payloadKey");
}

function assertStringField(
  record: Record<string, unknown>,
  fieldName: string,
): void {
  if (typeof record[fieldName] !== "string") {
    throw new Error(
      `Unlocked vault session material field "${fieldName}" is malformed.`,
    );
  }
}

function assertNumberField(
  record: Record<string, unknown>,
  fieldName: string,
): void {
  if (typeof record[fieldName] !== "number") {
    throw new Error(
      `Unlocked vault session material field "${fieldName}" is malformed.`,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
