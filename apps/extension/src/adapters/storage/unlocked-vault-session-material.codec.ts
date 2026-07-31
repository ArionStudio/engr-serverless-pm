import {
  decodeBase64Url,
  encodeBase64Url,
  type Base64URLString,
} from "@lfspm/core/lib";
import type {
  DeviceLocalProtectionKey,
  DevicePublicSignKey,
  DeviceVaultPrivateKey,
  DeviceVaultPublicKey,
  UnlockedVaultSessionMaterial,
  VersionVector,
} from "@lfspm/core";

type StoredUnlockedVaultSessionMaterial = {
  sessionId: string;
  vaultId: string;
  sourceSnapshotVersionVector: VersionVector;
  deviceId: string;
  vaultMasterKey: Base64URLString;
  devicePrivateSignKey: Base64URLString;
  devicePrivateVaultKey: Base64URLString;
  deviceLocalProtectionKey: Base64URLString;
  payloadKey: Base64URLString;
  trustedSnapshotContext: {
    snapshotDigest: string;
    trust: {
      generation: number;
      vaultKeyGeneration: number;
      certificateDigest: string;
      trustedDevices: {
        deviceId: string;
        publicSignKey: Base64URLString;
        publicVaultKey: Base64URLString;
      }[];
    };
  };
  vaultTrustAnchor: {
    version: 1;
    vaultId: string;
    genesisDeviceId: string;
    genesisPublicSignKey: Base64URLString;
    genesisCertificateDigest: string;
  };
};

export function serializeUnlockedVaultSessionMaterial(
  material: UnlockedVaultSessionMaterial,
): StoredUnlockedVaultSessionMaterial {
  return {
    sessionId: material.sessionId,
    vaultId: material.vaultId,
    sourceSnapshotVersionVector: material.sourceSnapshotVersionVector,
    deviceId: material.deviceId,
    vaultMasterKey: arrayBufferToBase64Url(material.vaultMasterKey),
    devicePrivateSignKey: arrayBufferToBase64Url(material.devicePrivateSignKey),
    devicePrivateVaultKey: arrayBufferToBase64Url(
      material.devicePrivateVaultKey,
    ),
    deviceLocalProtectionKey: arrayBufferToBase64Url(
      material.deviceLocalProtectionKey,
    ),
    payloadKey: arrayBufferToBase64Url(material.payloadKey),
    trustedSnapshotContext: {
      snapshotDigest: material.trustedSnapshotContext.snapshotDigest,
      trust: {
        generation: material.trustedSnapshotContext.trust.generation,
        vaultKeyGeneration:
          material.trustedSnapshotContext.trust.vaultKeyGeneration,
        certificateDigest:
          material.trustedSnapshotContext.trust.certificateDigest,
        trustedDevices:
          material.trustedSnapshotContext.trust.trustedDevices.map(
            (device) => ({
              deviceId: device.deviceId,
              publicSignKey: arrayBufferToBase64Url(device.publicSignKey),
              publicVaultKey: arrayBufferToBase64Url(device.publicVaultKey),
            }),
          ),
      },
    },
    vaultTrustAnchor: {
      ...material.vaultTrustAnchor,
      genesisPublicSignKey: arrayBufferToBase64Url(
        material.vaultTrustAnchor.genesisPublicSignKey,
      ),
    },
  };
}

export function deserializeUnlockedVaultSessionMaterial(
  material: unknown,
): UnlockedVaultSessionMaterial {
  assertStoredMaterial(material);

  return {
    sessionId: material.sessionId,
    vaultId: material.vaultId,
    sourceSnapshotVersionVector: material.sourceSnapshotVersionVector,
    deviceId: material.deviceId,
    vaultMasterKey: base64UrlToArrayBuffer(
      material.vaultMasterKey,
    ) as UnlockedVaultSessionMaterial["vaultMasterKey"],
    devicePrivateSignKey: base64UrlToArrayBuffer(
      material.devicePrivateSignKey,
    ) as UnlockedVaultSessionMaterial["devicePrivateSignKey"],
    devicePrivateVaultKey: base64UrlToArrayBuffer(
      material.devicePrivateVaultKey,
    ) as DeviceVaultPrivateKey,
    deviceLocalProtectionKey: base64UrlToArrayBuffer(
      material.deviceLocalProtectionKey,
    ) as DeviceLocalProtectionKey,
    payloadKey: base64UrlToArrayBuffer(
      material.payloadKey,
    ) as UnlockedVaultSessionMaterial["payloadKey"],
    trustedSnapshotContext: {
      ...material.trustedSnapshotContext,
      trust: {
        ...material.trustedSnapshotContext.trust,
        trustedDevices:
          material.trustedSnapshotContext.trust.trustedDevices.map(
            (device) => ({
              deviceId: device.deviceId,
              publicSignKey: base64UrlToArrayBuffer(
                device.publicSignKey,
              ) as DevicePublicSignKey,
              publicVaultKey: base64UrlToArrayBuffer(
                device.publicVaultKey,
              ) as DeviceVaultPublicKey,
            }),
          ),
      },
    },
    vaultTrustAnchor: {
      ...material.vaultTrustAnchor,
      genesisPublicSignKey: base64UrlToArrayBuffer(
        material.vaultTrustAnchor.genesisPublicSignKey,
      ) as DevicePublicSignKey,
    },
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
  assertVersionVectorField(material, "sourceSnapshotVersionVector");
  assertStringField(material, "deviceId");
  assertStringField(material, "vaultMasterKey");
  assertStringField(material, "devicePrivateSignKey");
  assertStringField(material, "devicePrivateVaultKey");
  assertStringField(material, "deviceLocalProtectionKey");
  assertStringField(material, "payloadKey");
  assertTrustedSnapshotContext(material.trustedSnapshotContext);
  assertVaultTrustAnchor(material.vaultTrustAnchor);
}

function assertTrustedSnapshotContext(
  value: unknown,
): asserts value is StoredUnlockedVaultSessionMaterial["trustedSnapshotContext"] {
  if (!isRecord(value)) {
    throw malformedField("trustedSnapshotContext");
  }

  assertStringField(value, "snapshotDigest");
  const trust = value.trust;

  if (!isRecord(trust)) {
    throw malformedField("trustedSnapshotContext.trust");
  }

  assertNumberField(trust, "generation");
  assertNumberField(trust, "vaultKeyGeneration");
  assertStringField(trust, "certificateDigest");

  if (!Array.isArray(trust.trustedDevices)) {
    throw malformedField("trustedSnapshotContext.trust.trustedDevices");
  }

  for (const device of trust.trustedDevices) {
    if (!isRecord(device)) {
      throw malformedField("trustedSnapshotContext.trust.trustedDevices");
    }

    assertStringField(device, "deviceId");
    assertStringField(device, "publicSignKey");
    assertStringField(device, "publicVaultKey");
  }
}

function assertVaultTrustAnchor(
  value: unknown,
): asserts value is StoredUnlockedVaultSessionMaterial["vaultTrustAnchor"] {
  if (!isRecord(value) || value.version !== 1) {
    throw malformedField("vaultTrustAnchor");
  }

  assertStringField(value, "vaultId");
  assertStringField(value, "genesisDeviceId");
  assertStringField(value, "genesisPublicSignKey");
  assertStringField(value, "genesisCertificateDigest");
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
    throw malformedField(fieldName);
  }
}

function malformedField(fieldName: string): Error {
  return new Error(
    `Unlocked vault session material field "${fieldName}" is malformed.`,
  );
}

function assertVersionVectorField(
  record: Record<string, unknown>,
  fieldName: string,
): void {
  const value = record[fieldName];

  if (!isRecord(value)) {
    throw new Error(
      `Unlocked vault session material field "${fieldName}" is malformed.`,
    );
  }

  for (const version of Object.values(value)) {
    if (typeof version !== "number") {
      throw new Error(
        `Unlocked vault session material field "${fieldName}" is malformed.`,
      );
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
