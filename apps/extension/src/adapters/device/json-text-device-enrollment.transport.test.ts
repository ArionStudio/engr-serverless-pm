import { describe, expect, it, vi } from "vitest";
import {
  CURRENT_ALGORITHM_SUITE,
  type DeviceEnrollmentRequest,
  type DeviceEnrollmentResponse,
  type Vault,
  type VaultSnapshot,
} from "@lfspm/core";
import { encodeBase64Url } from "@lfspm/core/lib";
import type { AsymmetricKeyValidator } from "../crypto";
import { WebCryptoAdapter } from "../crypto";
import { InvalidDeviceEnrollmentArtifactError } from "./index";
import { JsonTextDeviceEnrollmentTransport } from "./json-text-device-enrollment.transport";

type EnrollmentArtifacts = {
  readonly request: DeviceEnrollmentRequest;
  readonly response: DeviceEnrollmentResponse;
};

describe("JsonTextDeviceEnrollmentTransport", () => {
  it("binds the displayed request fingerprint to the full request, including device public keys", async () => {
    const { request } = await createEnrollmentArtifacts();
    const transport = new JsonTextDeviceEnrollmentTransport();
    const fingerprint =
      await transport.fingerprintDeviceEnrollmentRequest(request);
    const parsed = await transport.parseDeviceEnrollmentRequest(
      transport.serializeDeviceEnrollmentRequest(request),
    );
    expect(await transport.fingerprintDeviceEnrollmentRequest(parsed)).toBe(
      fingerprint,
    );
    const keys = await new WebCryptoAdapter().generateDeviceSignKeyPair();
    expect(
      await transport.fingerprintDeviceEnrollmentRequest({
        ...request,
        payload: { ...request.payload, publicSignKey: keys.publicKey },
      }),
    ).not.toBe(fingerprint);
  });

  it("round-trips exact request and response JSON with the default key validator", async () => {
    const artifacts = await createEnrollmentArtifacts();
    const transport = new JsonTextDeviceEnrollmentTransport();

    const requestText = transport.serializeDeviceEnrollmentRequest(
      artifacts.request,
    );
    const responseText = transport.serializeDeviceEnrollmentResponse(
      artifacts.response,
    );

    const request = await transport.parseDeviceEnrollmentRequest(requestText);
    const response =
      await transport.parseDeviceEnrollmentResponse(responseText);

    expect(transport.serializeDeviceEnrollmentRequest(request)).toBe(
      requestText,
    );
    expect(transport.serializeDeviceEnrollmentResponse(response)).toBe(
      responseText,
    );
  });

  it("imports request, trust-anchor, certificate, and key-slot public keys", async () => {
    const artifacts = await createEnrollmentArtifacts();
    const validator = createValidator();
    const transport = new JsonTextDeviceEnrollmentTransport(validator);

    await transport.parseDeviceEnrollmentRequest(
      transport.serializeDeviceEnrollmentRequest(artifacts.request),
    );
    await transport.parseDeviceEnrollmentResponse(
      transport.serializeDeviceEnrollmentResponse(artifacts.response),
    );

    expect(validator.importDeviceSignPublicKey).toHaveBeenCalledTimes(3);
    expect(validator.importDeviceVaultPublicKey).toHaveBeenCalledTimes(3);
    expect(validator.importDeviceSignPublicKey).toHaveBeenCalledWith(
      artifacts.request.payload.publicSignKey,
    );
    expect(validator.importDeviceSignPublicKey).toHaveBeenCalledWith(
      artifacts.response.vaultTrustAnchor.genesisPublicSignKey,
    );
    expect(validator.importDeviceSignPublicKey).toHaveBeenCalledWith(
      artifacts.response.snapshot.trustChain.certificates[0]?.payload
        .trustedDevices[0]?.publicSignKey,
    );
    expect(validator.importDeviceVaultPublicKey).toHaveBeenCalledWith(
      artifacts.response.snapshot.keySlots.deviceSlots[0]?.envelope
        .ephemeralPublicKey,
    );
  });

  it.each([
    ["request old version", "request", "old-version"],
    ["request future version", "request", "future-version"],
    ["request missing field", "request", "missing-field"],
    ["request wrong field type", "request", "wrong-type"],
    ["request extra field", "request", "extra-field"],
    ["response old version", "response", "old-version"],
    ["response future version", "response", "future-version"],
    ["response missing field", "response", "missing-field"],
    ["response wrong field type", "response", "wrong-type"],
    ["response extra field", "response", "extra-field"],
  ] as const)(
    "rejects %s before asymmetric-key validation",
    async (_label, family, variant) => {
      const artifacts = await createEnrollmentArtifacts();
      const validator = createValidator();
      const transport = new JsonTextDeviceEnrollmentTransport(validator);
      const validText =
        family === "request"
          ? transport.serializeDeviceEnrollmentRequest(artifacts.request)
          : transport.serializeDeviceEnrollmentResponse(artifacts.response);
      const hostile = mutateOuterArtifact(validText, family, variant);

      await expectInvalidEnrollmentArtifact(
        family === "request"
          ? transport.parseDeviceEnrollmentRequest(JSON.stringify(hostile))
          : transport.parseDeviceEnrollmentResponse(JSON.stringify(hostile)),
      );
      expectNoPublicKeyImports(validator);
    },
  );

  it.each([
    ["padded request public key", "request-key"],
    ["padded request signature", "request-signature"],
    ["padded response nested key", "response-key"],
    ["padded response signature", "response-signature"],
  ] as const)("rejects noncanonical %s", async (_label, variant) => {
    const artifacts = await createEnrollmentArtifacts();
    const validator = createValidator();
    const transport = new JsonTextDeviceEnrollmentTransport(validator);
    const isRequest = variant.startsWith("request");
    const text = isRequest
      ? transport.serializeDeviceEnrollmentRequest(artifacts.request)
      : transport.serializeDeviceEnrollmentResponse(artifacts.response);
    const hostile = record(parseJson(text));

    if (variant === "request-key") {
      const payload = record(hostile.payload);
      payload.publicSignKey = `${String(payload.publicSignKey)}=`;
    } else if (variant === "request-signature") {
      const signature = record(hostile.signature);
      signature.signature = `${String(signature.signature)}=`;
    } else if (variant === "response-key") {
      const trustedDevice = firstTrustedDevice(hostile);
      trustedDevice.publicVaultKey = `${String(trustedDevice.publicVaultKey)}=`;
    } else {
      const snapshot = record(hostile.snapshot);
      const signature = record(snapshot.signature);
      signature.signature = `${String(signature.signature)}=`;
    }

    await expectInvalidEnrollmentArtifact(
      isRequest
        ? transport.parseDeviceEnrollmentRequest(JSON.stringify(hostile))
        : transport.parseDeviceEnrollmentResponse(JSON.stringify(hostile)),
    );
    expectNoPublicKeyImports(validator);
  });

  it.each([
    "duplicate trusted identity",
    "duplicate key slot",
    "anchor vault mismatch",
    "nested extra field",
  ])(
    "rejects a response with %s before asymmetric-key validation",
    async (variant) => {
      const artifacts = await createEnrollmentArtifacts();
      const validator = createValidator();
      const transport = new JsonTextDeviceEnrollmentTransport(validator);
      const hostile = record(
        parseJson(
          transport.serializeDeviceEnrollmentResponse(artifacts.response),
        ),
      );
      const snapshot = record(hostile.snapshot);

      if (variant === "duplicate trusted identity") {
        const trustedDevices = trustedDeviceArtifacts(snapshot);
        trustedDevices.push(structuredClone(trustedDevices[0]));
      } else if (variant === "duplicate key slot") {
        const slots = deviceSlotArtifacts(snapshot);
        slots.push(structuredClone(slots[0]));
      } else if (variant === "anchor vault mismatch") {
        record(hostile.vaultTrustAnchor).vaultId = "other-vault";
      } else {
        record(snapshot.metadata).futureField = true;
      }

      await expectInvalidEnrollmentArtifact(
        transport.parseDeviceEnrollmentResponse(JSON.stringify(hostile)),
      );
      expectNoPublicKeyImports(validator);
    },
  );

  it("rejects valid-length non-importable request P-256 material", async () => {
    const artifacts = await createEnrollmentArtifacts();
    const transport = new JsonTextDeviceEnrollmentTransport();
    const hostile = record(
      parseJson(transport.serializeDeviceEnrollmentRequest(artifacts.request)),
    );
    record(hostile.payload).publicVaultKey = encodeBase64Url(
      new Uint8Array(65),
    );

    await expectInvalidEnrollmentArtifact(
      transport.parseDeviceEnrollmentRequest(JSON.stringify(hostile)),
    );
  });

  it("rejects valid-length non-importable nested snapshot P-256 material", async () => {
    const artifacts = await createEnrollmentArtifacts();
    const transport = new JsonTextDeviceEnrollmentTransport();
    const hostile = record(
      parseJson(
        transport.serializeDeviceEnrollmentResponse(artifacts.response),
      ),
    );
    firstTrustedDevice(record(hostile.snapshot)).publicVaultKey =
      encodeBase64Url(new Uint8Array(65));

    await expectInvalidEnrollmentArtifact(
      transport.parseDeviceEnrollmentResponse(JSON.stringify(hostile)),
    );
  });

  it("normalizes JSON and validator failures to one exact static error", async () => {
    const artifacts = await createEnrollmentArtifacts();
    const validator = createValidator();
    vi.mocked(validator.importDeviceSignPublicKey).mockRejectedValueOnce(
      new Error("hostile-key-material"),
    );
    const transport = new JsonTextDeviceEnrollmentTransport(validator);

    await expectInvalidEnrollmentArtifact(
      transport.parseDeviceEnrollmentRequest("{"),
    );
    await expectInvalidEnrollmentArtifact(
      transport.parseDeviceEnrollmentRequest(
        transport.serializeDeviceEnrollmentRequest(artifacts.request),
      ),
    );
  });
});

async function createEnrollmentArtifacts(): Promise<EnrollmentArtifacts> {
  const crypto = new WebCryptoAdapter();
  const signKeys = await crypto.generateDeviceSignKeyPair();
  const vaultKeys = await crypto.generateDeviceVaultKeyPair();
  const vaultMasterKey = await crypto.generateVaultMasterKey();
  const vaultId = "vault-id";
  const deviceId = "device-id";
  const certificatePayload = {
    version: 1 as const,
    vaultId,
    generation: 0,
    vaultKeyGeneration: 1,
    previousCertificateDigest: null,
    authorizedByDeviceId: deviceId,
    trustedDevices: [
      {
        deviceId,
        publicSignKey: signKeys.publicKey,
        publicVaultKey: vaultKeys.publicKey,
      },
    ],
  };
  const certificate = {
    payload: certificatePayload,
    signature: await crypto.signVaultTrustCertificate(
      certificatePayload,
      signKeys.privateKey,
    ),
  };
  const genesisCertificateDigest =
    await crypto.digestVaultTrustCertificate(certificate);
  const trustAnchor = {
    version: 1 as const,
    vaultId,
    genesisDeviceId: deviceId,
    genesisPublicSignKey: signKeys.publicKey,
    genesisCertificateDigest,
  };
  const snapshotContext = {
    vaultId,
    deviceId,
    vaultKeyGeneration: 1,
    algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
  };
  const unsignedSnapshot = {
    metadata: {
      id: vaultId,
      schemaVersion: 1 as const,
      vaultCreationTimestamp: 1,
      revisionTimestamp: 2,
      snapshotVersionVector: { [deviceId]: 1 },
      algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
      createdByDeviceId: deviceId,
      vaultKeyGeneration: 1,
    },
    trustChain: { certificates: [certificate] },
    keySlots: {
      deviceSlots: [
        {
          deviceId,
          vaultKeyGeneration: 1,
          envelope: await crypto.createDeviceVaultKeyEnvelope(
            vaultMasterKey,
            vaultKeys.publicKey,
            snapshotContext,
          ),
        },
      ],
    },
    content: await crypto.encryptVaultSnapshotContent(
      createEmptyVault(deviceId),
      vaultMasterKey,
    ),
  };
  const snapshot: VaultSnapshot = {
    ...unsignedSnapshot,
    signature: await crypto.signVaultSnapshot(
      unsignedSnapshot,
      signKeys.privateKey,
    ),
  };
  const requestPayload = {
    version: 1 as const,
    requestId: "request-id",
    vaultId,
    expectedGenesisCertificateDigest: genesisCertificateDigest,
    deviceId,
    algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
    publicSignKey: signKeys.publicKey,
    publicVaultKey: vaultKeys.publicKey,
  };

  return {
    request: {
      payload: requestPayload,
      signature: await crypto.signDeviceEnrollmentRequest(
        requestPayload,
        signKeys.privateKey,
      ),
    },
    response: {
      version: 1,
      requestId: requestPayload.requestId,
      vaultId,
      vaultTrustAnchor: trustAnchor,
      snapshot,
    },
  };
}

function createEmptyVault(deviceId: string): Vault {
  return {
    versionVector: { [deviceId]: 1 },
    entries: [],
    deletedEntries: [],
    deviceProfiles: [],
    deletedDeviceProfiles: [],
    tags: [],
    deletedTags: [],
    tagGroups: [],
    folders: [],
    deletedFolders: [],
  };
}

function createValidator(): AsymmetricKeyValidator {
  return {
    importDeviceSignPublicKey: vi.fn(async () => ({}) as CryptoKey),
    importDeviceSignPrivateKey: vi.fn(async () => ({}) as CryptoKey),
    importDeviceVaultPublicKey: vi.fn(async () => ({}) as CryptoKey),
    importDeviceVaultPrivateKey: vi.fn(async () => ({}) as CryptoKey),
  };
}

function mutateOuterArtifact(
  validText: string,
  family: "request" | "response",
  variant:
    | "old-version"
    | "future-version"
    | "missing-field"
    | "wrong-type"
    | "extra-field",
): unknown {
  const artifact = record(parseJson(validText));
  const versionOwner =
    family === "request" ? record(artifact.payload) : artifact;

  if (variant === "old-version") {
    versionOwner.version = 0;
    return artifact;
  }
  if (variant === "future-version") {
    versionOwner.version = 2;
    return artifact;
  }
  if (variant === "wrong-type") {
    versionOwner.requestId = 7;
    return artifact;
  }
  if (variant === "extra-field") {
    versionOwner.futureField = true;
    return artifact;
  }

  if (family === "request") {
    const payload = record(artifact.payload);
    const { publicVaultKey: _publicVaultKey, ...withoutPublicVaultKey } =
      payload;
    void _publicVaultKey;
    artifact.payload = withoutPublicVaultKey;
    return artifact;
  }

  const { snapshot: _snapshot, ...withoutSnapshot } = artifact;
  void _snapshot;
  return withoutSnapshot;
}

function firstTrustedDevice(snapshotOrResponse: Record<string, unknown>) {
  const snapshot =
    "trustChain" in snapshotOrResponse
      ? snapshotOrResponse
      : record(snapshotOrResponse.snapshot);
  return record(trustedDeviceArtifacts(snapshot)[0]);
}

function trustedDeviceArtifacts(snapshot: Record<string, unknown>): unknown[] {
  const trustChain = record(snapshot.trustChain);
  const certificate = record(array(trustChain.certificates)[0]);
  const payload = record(certificate.payload);
  return array(payload.trustedDevices);
}

function deviceSlotArtifacts(snapshot: Record<string, unknown>): unknown[] {
  return array(record(snapshot.keySlots).deviceSlots);
}

function expectNoPublicKeyImports(validator: AsymmetricKeyValidator): void {
  expect(validator.importDeviceSignPublicKey).not.toHaveBeenCalled();
  expect(validator.importDeviceVaultPublicKey).not.toHaveBeenCalled();
}

async function expectInvalidEnrollmentArtifact(
  operation: Promise<unknown>,
): Promise<void> {
  let thrown: unknown;

  try {
    await operation;
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(InvalidDeviceEnrollmentArtifactError);
  expect(thrown).toMatchObject({
    name: "InvalidDeviceEnrollmentArtifactError",
    message: "Device enrollment artifact is malformed.",
  });
  expect(Object.hasOwn(record(thrown), "cause")).toBe(false);
  expect(Object.hasOwn(record(thrown), "input")).toBe(false);
}

function parseJson(serialized: string): unknown {
  return JSON.parse(serialized) as unknown;
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
