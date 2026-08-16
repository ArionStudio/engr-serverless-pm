import {
  CURRENT_ALGORITHM_SUITE,
  type DeviceLocalProtectionKey,
  type DevicePrivateSignKey,
  type DevicePublicSignKey,
  type DeviceVaultPrivateKey,
  type DeviceVaultPublicKey,
  type UnlockedVaultSessionMaterial,
  type VersionVector,
} from "@lfspm/core";
import {
  bestEffortWipeArrayBuffers,
  type Base64URLString,
} from "@lfspm/core/lib";
import type { AsymmetricKeyValidator } from "../crypto";
import {
  canonicalDigest,
  decodeCanonicalBytes,
  decodeVersionVector,
  encodeBytes,
  exactRecord,
  nonBlankString,
  safeInteger,
} from "../codecs/artifact-codec.primitives";

const SYMMETRIC_KEY_LENGTH_BYTES =
  CURRENT_ALGORITHM_SUITE.vaultMasterKeyGeneration.keyLengthBits / 8;

const MATERIAL_KEYS = [
  "sessionId",
  "vaultId",
  "sourceSnapshotVersionVector",
  "deviceId",
  "vaultMasterKey",
  "devicePrivateSignKey",
  "devicePrivateVaultKey",
  "deviceLocalProtectionKey",
  "payloadKey",
  "trustedSnapshotContext",
  "vaultTrustAnchor",
] as const;
const TRUSTED_SNAPSHOT_CONTEXT_KEYS = ["snapshotDigest", "trust"] as const;
const TRUST_KEYS = [
  "generation",
  "vaultKeyGeneration",
  "certificateDigest",
  "trustedDevices",
] as const;
const TRUSTED_DEVICE_KEYS = [
  "deviceId",
  "publicSignKey",
  "publicVaultKey",
] as const;
const TRUST_ANCHOR_KEYS = [
  "version",
  "vaultId",
  "genesisDeviceId",
  "genesisPublicSignKey",
  "genesisCertificateDigest",
] as const;

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

export class InvalidUnlockedVaultSessionMaterialError extends Error {
  override readonly name = "InvalidUnlockedVaultSessionMaterialError";

  constructor() {
    super("Unlocked vault session material is malformed.");
  }
}

export function serializeUnlockedVaultSessionMaterial(
  material: UnlockedVaultSessionMaterial,
): StoredUnlockedVaultSessionMaterial {
  return {
    sessionId: material.sessionId,
    vaultId: material.vaultId,
    sourceSnapshotVersionVector: material.sourceSnapshotVersionVector,
    deviceId: material.deviceId,
    vaultMasterKey: encodeBytes(material.vaultMasterKey),
    devicePrivateSignKey: encodeBytes(material.devicePrivateSignKey),
    devicePrivateVaultKey: encodeBytes(material.devicePrivateVaultKey),
    deviceLocalProtectionKey: encodeBytes(material.deviceLocalProtectionKey),
    payloadKey: encodeBytes(material.payloadKey),
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
              publicSignKey: encodeBytes(device.publicSignKey),
              publicVaultKey: encodeBytes(device.publicVaultKey),
            }),
          ),
      },
    },
    vaultTrustAnchor: {
      version: material.vaultTrustAnchor.version,
      vaultId: material.vaultTrustAnchor.vaultId,
      genesisDeviceId: material.vaultTrustAnchor.genesisDeviceId,
      genesisPublicSignKey: encodeBytes(
        material.vaultTrustAnchor.genesisPublicSignKey,
      ),
      genesisCertificateDigest:
        material.vaultTrustAnchor.genesisCertificateDigest,
    },
  };
}

export async function deserializeUnlockedVaultSessionMaterial(
  storedValue: unknown,
  asymmetricKeyValidator: AsymmetricKeyValidator,
): Promise<UnlockedVaultSessionMaterial> {
  const decodedSecrets: ArrayBuffer[] = [];

  try {
    const material = decodeStoredMaterial(storedValue, decodedSecrets);
    await validateAsymmetricKeys(material, asymmetricKeyValidator);
    return material;
  } catch {
    bestEffortWipeArrayBuffers(decodedSecrets);
    throw new InvalidUnlockedVaultSessionMaterialError();
  }
}

export async function deserializeUnlockedVaultSessionIdentity(
  storedValue: unknown,
  asymmetricKeyValidator: AsymmetricKeyValidator,
): Promise<
  Pick<
    UnlockedVaultSessionMaterial,
    "sessionId" | "vaultId" | "sourceSnapshotVersionVector"
  >
> {
  let material: UnlockedVaultSessionMaterial | undefined;
  try {
    material = await deserializeUnlockedVaultSessionMaterial(
      storedValue,
      asymmetricKeyValidator,
    );
    return {
      sessionId: material.sessionId,
      vaultId: material.vaultId,
      sourceSnapshotVersionVector: material.sourceSnapshotVersionVector,
    };
  } finally {
    bestEffortWipeArrayBuffers(
      material === undefined
        ? []
        : [
            material.vaultMasterKey,
            material.devicePrivateSignKey,
            material.devicePrivateVaultKey,
            material.deviceLocalProtectionKey,
            material.payloadKey,
          ],
    );
  }
}

function decodeStoredMaterial(
  storedValue: unknown,
  decodedSecrets: ArrayBuffer[],
): UnlockedVaultSessionMaterial {
  const material = exactRecord(storedValue, MATERIAL_KEYS);
  const sessionId = nonBlankString(material.sessionId);
  const vaultId = nonBlankString(material.vaultId);
  const sourceSnapshotVersionVector = decodeVersionVector(
    material.sourceSnapshotVersionVector,
  );
  const deviceId = nonBlankString(material.deviceId);
  const vaultMasterKey = decodeSecret<
    UnlockedVaultSessionMaterial["vaultMasterKey"]
  >(material.vaultMasterKey, SYMMETRIC_KEY_LENGTH_BYTES, decodedSecrets);
  const devicePrivateSignKey = decodeSecret<DevicePrivateSignKey>(
    material.devicePrivateSignKey,
    CURRENT_ALGORITHM_SUITE.signing.privateKeyLengthBytes,
    decodedSecrets,
  );
  const devicePrivateVaultKey = decodeSecret<DeviceVaultPrivateKey>(
    material.devicePrivateVaultKey,
    CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.privateKeyLengthBytes,
    decodedSecrets,
  );
  const deviceLocalProtectionKey = decodeSecret<DeviceLocalProtectionKey>(
    material.deviceLocalProtectionKey,
    CURRENT_ALGORITHM_SUITE.deviceLocalProtectionKeyGeneration.byteLength,
    decodedSecrets,
  );
  const payloadKey = decodeSecret<UnlockedVaultSessionMaterial["payloadKey"]>(
    material.payloadKey,
    CURRENT_ALGORITHM_SUITE.unlockedVaultSessionPayloadKeyGeneration.byteLength,
    decodedSecrets,
  );
  const trustedSnapshotContext = decodeTrustedSnapshotContext(
    material.trustedSnapshotContext,
  );
  const vaultTrustAnchor = decodeVaultTrustAnchor(material.vaultTrustAnchor);

  if (
    vaultTrustAnchor.vaultId !== vaultId ||
    !trustedSnapshotContext.trust.trustedDevices.some(
      (device) => device.deviceId === deviceId,
    )
  ) {
    throw new Error("identity");
  }

  const trustedGenesisDevice = trustedSnapshotContext.trust.trustedDevices.find(
    (device) => device.deviceId === vaultTrustAnchor.genesisDeviceId,
  );
  if (
    trustedGenesisDevice !== undefined &&
    !buffersEqual(
      trustedGenesisDevice.publicSignKey,
      vaultTrustAnchor.genesisPublicSignKey,
    )
  ) {
    throw new Error("genesis identity");
  }

  return {
    sessionId,
    vaultId,
    sourceSnapshotVersionVector,
    deviceId,
    vaultMasterKey,
    devicePrivateSignKey,
    devicePrivateVaultKey,
    deviceLocalProtectionKey,
    payloadKey,
    trustedSnapshotContext,
    vaultTrustAnchor,
  };
}

function decodeTrustedSnapshotContext(
  value: unknown,
): UnlockedVaultSessionMaterial["trustedSnapshotContext"] {
  const context = exactRecord(value, TRUSTED_SNAPSHOT_CONTEXT_KEYS);
  const trust = exactRecord(context.trust, TRUST_KEYS);
  if (!Array.isArray(trust.trustedDevices)) {
    throw new Error("trusted devices");
  }

  const trustedDevices = trust.trustedDevices.map((deviceValue) => {
    const device = exactRecord(deviceValue, TRUSTED_DEVICE_KEYS);
    return {
      deviceId: nonBlankString(device.deviceId),
      publicSignKey: decodeCanonicalBytes<DevicePublicSignKey>(
        device.publicSignKey,
        CURRENT_ALGORITHM_SUITE.signing.publicKeyLengthBytes,
      ),
      publicVaultKey: decodeCanonicalBytes<DeviceVaultPublicKey>(
        device.publicVaultKey,
        CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.publicKeyLengthBytes,
      ),
    };
  });
  requireUnique(trustedDevices.map((device) => device.deviceId));

  return {
    snapshotDigest: canonicalDigest(context.snapshotDigest),
    trust: {
      generation: safeInteger(trust.generation),
      vaultKeyGeneration: safeInteger(trust.vaultKeyGeneration, 1),
      certificateDigest: canonicalDigest(trust.certificateDigest),
      trustedDevices,
    },
  };
}

function decodeVaultTrustAnchor(
  value: unknown,
): UnlockedVaultSessionMaterial["vaultTrustAnchor"] {
  const anchor = exactRecord(value, TRUST_ANCHOR_KEYS);
  if (anchor.version !== 1) {
    throw new Error("anchor version");
  }

  return {
    version: 1,
    vaultId: nonBlankString(anchor.vaultId),
    genesisDeviceId: nonBlankString(anchor.genesisDeviceId),
    genesisPublicSignKey: decodeCanonicalBytes<DevicePublicSignKey>(
      anchor.genesisPublicSignKey,
      CURRENT_ALGORITHM_SUITE.signing.publicKeyLengthBytes,
    ),
    genesisCertificateDigest: canonicalDigest(anchor.genesisCertificateDigest),
  };
}

async function validateAsymmetricKeys(
  material: UnlockedVaultSessionMaterial,
  validator: AsymmetricKeyValidator,
): Promise<void> {
  await validator.importDeviceSignPrivateKey(material.devicePrivateSignKey);
  await validator.importDeviceVaultPrivateKey(material.devicePrivateVaultKey);

  for (const device of material.trustedSnapshotContext.trust.trustedDevices) {
    await validator.importDeviceSignPublicKey(device.publicSignKey);
    await validator.importDeviceVaultPublicKey(device.publicVaultKey);
  }

  await validator.importDeviceSignPublicKey(
    material.vaultTrustAnchor.genesisPublicSignKey,
  );
}

function requireUnique(values: readonly string[]): void {
  if (new Set(values).size !== values.length) {
    throw new Error("duplicate identity");
  }
}

function decodeSecret<T extends ArrayBuffer>(
  value: unknown,
  expectedLength: number | undefined,
  decodedSecrets: ArrayBuffer[],
): T {
  const secret = decodeCanonicalBytes<T>(value, expectedLength);
  decodedSecrets.push(secret);
  return secret;
}

function buffersEqual(left: ArrayBuffer, right: ArrayBuffer): boolean {
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  const leftBytes = new Uint8Array(left);
  const rightBytes = new Uint8Array(right);
  return leftBytes.every((byte, index) => byte === rightBytes[index]);
}
