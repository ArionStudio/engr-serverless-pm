import { describe, expect, it } from "vitest";
import {
  CURRENT_ALGORITHM_SUITE,
  type Vault,
  type VaultSnapshot,
  type VaultSnapshotDescriptor,
  type VaultSnapshotIdentity,
} from "@lfspm/core";
import { WebCryptoAdapter } from "../crypto/web-crypto.adapter";
import { encodeVersionVector } from "../codecs/artifact-codec.primitives";
import {
  InvalidLocalVaultSnapshotRecordError,
  InvalidOpenedVaultMasterKeyError,
  InvalidRemoteVaultSnapshotRecordError,
  InvalidVaultSnapshotPayloadError,
  decodeVaultSnapshot,
  decodeVaultSnapshotDescriptor,
  encodeVaultSnapshot,
  encodeVaultSnapshotDescriptor,
} from "../codecs/vault-snapshot.codec";

const canonicalSnapshotDigest = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

describe("vault snapshot artifact codec", () => {
  it("encodes version-vector keys in locale-independent code-unit order", () => {
    expect(
      Object.keys(
        encodeVersionVector({
          "z-device": 1,
          "ä-device": 2,
          "a-device": 3,
          "A-device": 4,
        }),
      ),
    ).toEqual(["A-device", "a-device", "z-device", "ä-device"]);
  });

  it.each([
    [
      InvalidLocalVaultSnapshotRecordError,
      "InvalidLocalVaultSnapshotRecordError",
      "Local vault snapshot record is malformed.",
    ],
    [
      InvalidRemoteVaultSnapshotRecordError,
      "InvalidRemoteVaultSnapshotRecordError",
      "Remote vault snapshot record is malformed.",
    ],
    [
      InvalidOpenedVaultMasterKeyError,
      "InvalidOpenedVaultMasterKeyError",
      "Opened vault master key is malformed.",
    ],
    [
      InvalidVaultSnapshotPayloadError,
      "InvalidVaultSnapshotPayloadError",
      "Vault snapshot payload is malformed.",
    ],
  ] as const)("exposes static secret-free %s", (ErrorType, name, message) => {
    const error = new ErrorType();
    expect(error).toMatchObject({ name, message });
    expect(Object.hasOwn(error, "cause")).toBe(false);
    expect(Object.hasOwn(error, "input")).toBe(false);
  });

  it("round-trips the complete current signed snapshot and descriptor", async () => {
    const snapshot = await createSnapshot();
    const encoded = encodeVaultSnapshot(snapshot);

    expect(encodeVaultSnapshot(decodeVaultSnapshot(encoded, "local"))).toEqual(
      encoded,
    );

    const descriptor: VaultSnapshotDescriptor = {
      vaultId: snapshot.metadata.id,
      snapshotVersionVector: snapshot.metadata.snapshotVersionVector,
      revisionTimestamp: snapshot.metadata.revisionTimestamp,
    };
    const encodedDescriptor = encodeVaultSnapshotDescriptor(descriptor);
    expect(
      encodeVaultSnapshotDescriptor(
        decodeVaultSnapshotDescriptor(encodedDescriptor),
      ),
    ).toEqual(encodedDescriptor);
  });

  it.each([
    null,
    {
      descriptor: {
        vaultId: "vault-id",
        snapshotVersionVector: { "device-id": 1 },
        revisionTimestamp: 1,
      },
      snapshotDigest: canonicalSnapshotDigest,
    },
  ] satisfies readonly (VaultSnapshotIdentity | null)[])(
    "round-trips the nullable signed upload expectation %#",
    async (uploadExpectedRemoteSnapshotIdentity) => {
      const snapshot = await createSnapshot();
      const snapshotWithExpectation: VaultSnapshot = {
        ...snapshot,
        metadata: {
          ...snapshot.metadata,
          uploadExpectedRemoteSnapshotIdentity,
        },
      };
      const encoded = encodeVaultSnapshot(snapshotWithExpectation);

      expect(decodeVaultSnapshot(encoded, "local").metadata).toEqual(
        snapshotWithExpectation.metadata,
      );
      expect(
        encodeVaultSnapshot(decodeVaultSnapshot(encoded, "local")),
      ).toEqual(encoded);
    },
  );

  it.each([
    "older schema",
    "future schema",
    "missing field",
    "extra field",
    "negative counter",
    "exotic version vector",
    "noncanonical signature",
    "malformed ciphertext",
    "duplicate trusted device",
    "duplicate key slot",
    "malformed upload expectation",
    "wrong-length upload digest",
    "noncanonical upload digest",
  ])("rejects %s before returning a local snapshot", async (variant) => {
    const artifact = cloneArtifact(encodeVaultSnapshot(await createSnapshot()));
    const metadata = record(artifact.metadata);
    const trustChain = record(artifact.trustChain);
    const certificates = array(trustChain.certificates);
    const firstCertificate = record(certificates[0]);
    const certificatePayload = record(firstCertificate.payload);
    const trustedDevices = array(certificatePayload.trustedDevices);
    const keySlots = record(artifact.keySlots);
    const slots = array(keySlots.deviceSlots);

    switch (variant) {
      case "older schema":
        metadata.schemaVersion = 0;
        break;
      case "future schema":
        metadata.schemaVersion = 2;
        break;
      case "missing field": {
        const { content: _content, ...withoutContent } = artifact;
        void _content;
        await expectRejectedLocalSnapshot(withoutContent);
        return;
      }
      case "extra field":
        metadata.futureField = true;
        break;
      case "negative counter":
        record(metadata.snapshotVersionVector)["device-id"] = -1;
        break;
      case "exotic version vector":
        metadata.snapshotVersionVector = new Date(0);
        break;
      case "noncanonical signature": {
        const signature = record(artifact.signature);
        signature.signature = `${String(signature.signature)}=`;
        break;
      }
      case "malformed ciphertext":
        record(artifact.content).ciphertext = "***";
        break;
      case "duplicate trusted device":
        trustedDevices.push(structuredClone(trustedDevices[0]));
        break;
      case "duplicate key slot":
        slots.push(structuredClone(slots[0]));
        break;
      case "malformed upload expectation":
        metadata.uploadExpectedRemoteSnapshotIdentity = {
          descriptor: {
            vaultId: "vault-id",
            snapshotVersionVector: { "device-id": 1 },
            revisionTimestamp: 1,
          },
          snapshotDigest: canonicalSnapshotDigest,
          futureField: true,
        };
        break;
      case "wrong-length upload digest":
        metadata.uploadExpectedRemoteSnapshotIdentity = {
          descriptor: {
            vaultId: "vault-id",
            snapshotVersionVector: { "device-id": 1 },
            revisionTimestamp: 1,
          },
          snapshotDigest: "AAAA",
        };
        break;
      case "noncanonical upload digest":
        metadata.uploadExpectedRemoteSnapshotIdentity = {
          descriptor: {
            vaultId: "vault-id",
            snapshotVersionVector: { "device-id": 1 },
            revisionTimestamp: 1,
          },
          snapshotDigest: `${canonicalSnapshotDigest}=`,
        };
        break;
    }

    await expectRejectedLocalSnapshot(artifact);
  });

  it("uses the remote family error for hostile snapshot and descriptor records", async () => {
    const snapshot = await createSnapshot();
    const hostile = record(cloneArtifact(encodeVaultSnapshot(snapshot)));
    record(hostile.metadata).revisionTimestamp = Number.POSITIVE_INFINITY;

    expect(() => decodeVaultSnapshot(hostile)).toThrow(
      InvalidRemoteVaultSnapshotRecordError,
    );
    expect(() =>
      decodeVaultSnapshotDescriptor({
        vaultId: snapshot.metadata.id,
        snapshotVersionVector: { "device-id": 1.5 },
        revisionTimestamp: 1,
      }),
    ).toThrow(InvalidRemoteVaultSnapshotRecordError);
  });
});

async function expectRejectedLocalSnapshot(value: unknown): Promise<void> {
  let thrown: unknown;
  try {
    decodeVaultSnapshot(value, "local");
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(InvalidLocalVaultSnapshotRecordError);
  expect(thrown).toMatchObject({
    name: "InvalidLocalVaultSnapshotRecordError",
    message: "Local vault snapshot record is malformed.",
  });
  expect(Object.hasOwn(record(thrown), "cause")).toBe(false);
  expect(Object.hasOwn(record(thrown), "input")).toBe(false);
}

async function createSnapshot(): Promise<VaultSnapshot> {
  const crypto = new WebCryptoAdapter();
  const signing = await crypto.generateDeviceSignKeyPair();
  const vaultKeys = await crypto.generateDeviceVaultKeyPair();
  const vaultMasterKey = await crypto.generateVaultMasterKey();
  const context = {
    vaultId: "vault-id",
    deviceId: "device-id",
    vaultKeyGeneration: 1,
    algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
  };
  const trustPayload = {
    version: 1 as const,
    vaultId: context.vaultId,
    generation: 0,
    vaultKeyGeneration: 1,
    previousCertificateDigest: null,
    authorizedByDeviceId: context.deviceId,
    trustedDevices: [
      {
        deviceId: context.deviceId,
        publicSignKey: signing.publicKey,
        publicVaultKey: vaultKeys.publicKey,
      },
    ],
  };
  const unsigned = {
    metadata: {
      id: context.vaultId,
      schemaVersion: 1 as const,
      vaultCreationTimestamp: 1,
      revisionTimestamp: 2,
      snapshotVersionVector: { [context.deviceId]: 1 },
      algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
      createdByDeviceId: context.deviceId,
      vaultKeyGeneration: 1,
    },
    trustChain: {
      certificates: [
        {
          payload: trustPayload,
          signature: await crypto.signVaultTrustCertificate(
            trustPayload,
            signing.privateKey,
          ),
        },
      ],
    },
    keySlots: {
      deviceSlots: [
        {
          deviceId: context.deviceId,
          vaultKeyGeneration: 1,
          envelope: await crypto.createDeviceVaultKeyEnvelope(
            vaultMasterKey,
            vaultKeys.publicKey,
            context,
          ),
        },
      ],
    },
    content: await crypto.encryptVaultSnapshotContent(
      createVault(),
      vaultMasterKey,
    ),
  };

  return {
    ...unsigned,
    signature: await crypto.signVaultSnapshot(unsigned, signing.privateKey),
  };
}

function createVault(): Vault {
  return {
    versionVector: { "device-id": 1 },
    entries: [],
    deletedEntries: [],
    deviceProfiles: [
      {
        id: "device-id",
        name: "Device",
        createdAt: 1,
        versionVector: { "device-id": 1 },
      },
    ],
    deletedDeviceProfiles: [],
    tags: [],
    deletedTags: [],
    tagGroups: [],
    folders: [],
    deletedFolders: [],
  };
}

function cloneArtifact(value: unknown): Record<string, unknown> {
  return record(structuredClone(value));
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Expected a record in the test fixture.");
  }
  return value as Record<string, unknown>;
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError("Expected an array in the test fixture.");
  }
  return value;
}
