import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RemoteVaultSnapshotChangedError,
  RemoteVaultSnapshotNotFoundError,
} from "@lfspm/core";
import type {
  DevicePublicSignKey,
  DeviceVaultPublicKey,
  RandomBytes,
  SyncAccess,
  SyncSetupInput,
  VaultSnapshot,
  VaultSnapshotDescriptor,
  VaultSnapshotIdentity,
} from "@lfspm/core";
import type { Base64URLString } from "@lfspm/core/lib";
import type { AsymmetricKeyValidator } from "../crypto";
import {
  AwsS3SyncProvider,
  InvalidSyncProviderResponseError,
  type S3SyncClient,
  type S3SyncClientFactory,
} from "./aws-s3-sync-provider";

const codec = vi.hoisted(() => {
  class InvalidRemoteVaultSnapshotRecordError extends Error {
    constructor() {
      super("Remote vault snapshot record is invalid.");
      this.name = "InvalidRemoteVaultSnapshotRecordError";
    }
  }

  return {
    InvalidRemoteVaultSnapshotRecordError,
    decodeVaultSnapshot: vi.fn(),
    decodeVaultSnapshotDescriptor: vi.fn(),
    encodeVaultSnapshot: vi.fn(),
    encodeVaultSnapshotDescriptor: vi.fn(),
  };
});

vi.mock("../codecs/vault-snapshot.codec", () => codec);

const descriptor: VaultSnapshotDescriptor = {
  vaultId: "vault/id",
  snapshotVersionVector: { "device-id": 3 },
  revisionTimestamp: 47,
};
const snapshotDigest = "snapshot-digest";
const expectedRemoteSnapshotIdentity: VaultSnapshotIdentity = {
  descriptor,
  snapshotDigest,
};

const b64 = (value: string) => value as Base64URLString;

const snapshot = {
  metadata: {
    id: descriptor.vaultId,
    schemaVersion: 1,
    vaultCreationTimestamp: 11,
    revisionTimestamp: descriptor.revisionTimestamp,
    snapshotVersionVector: descriptor.snapshotVersionVector,
    algorithmSuiteId: "spm-v1",
    createdByDeviceId: "device-id",
    vaultKeyGeneration: 1,
  },
  trustChain: {
    certificates: [
      {
        payload: {
          version: 1,
          vaultId: descriptor.vaultId,
          generation: 0,
          vaultKeyGeneration: 1,
          previousCertificateDigest: null,
          authorizedByDeviceId: "device-id",
          trustedDevices: [
            {
              deviceId: "device-id",
              publicSignKey: new Uint8Array(32).buffer as DevicePublicSignKey,
              publicVaultKey: new Uint8Array(65).buffer as DeviceVaultPublicKey,
            },
          ],
        },
        signature: { signature: b64("certificate-signature") },
      },
    ],
  },
  keySlots: {
    deviceSlots: [
      {
        deviceId: "device-id",
        vaultKeyGeneration: 1,
        envelope: {
          recipientDeviceId: "device-id",
          vaultKeyGeneration: 1,
          ephemeralPublicKey: new Uint8Array(65).buffer as DeviceVaultPublicKey,
          hkdfSalt: new Uint8Array(32).buffer as RandomBytes,
          encryptedVaultMasterKey: {
            ciphertext: b64("encrypted-vault-master-key"),
            encryptionNonce: b64("encryption-nonce"),
          },
        },
      },
    ],
  },
  content: {
    ciphertext: b64("encrypted-vault-content"),
    encryptionNonce: b64("content-encryption-nonce"),
  },
  signature: { signature: b64("snapshot-signature") },
} satisfies VaultSnapshot;

let decodedSnapshot = snapshot;

const asymmetricKeyValidator: AsymmetricKeyValidator = {
  importDeviceSignPublicKey: vi.fn(async () => ({}) as CryptoKey),
  importDeviceSignPrivateKey: vi.fn(async () => ({}) as CryptoKey),
  importDeviceVaultPublicKey: vi.fn(async () => ({}) as CryptoKey),
  importDeviceVaultPrivateKey: vi.fn(async () => ({}) as CryptoKey),
};

const syncAccess: SyncAccess = {
  target: {
    provider: "aws-s3-v1",
    targetConfig: {
      bucket: "bucket-name",
      region: "eu-central-1",
      prefix: "vaults/",
    },
  },
  credentials: {
    provider: "aws-s3-v1",
    credentialsConfig: {
      accessKeyId: "access-key-id",
      secretAccessKey: "secret-access-key",
    },
  },
};

async function uploadVaultSnapshot(
  provider: AwsS3SyncProvider,
  access: SyncAccess,
  candidate: VaultSnapshot,
  expectedRemoteIdentity: VaultSnapshotIdentity | null,
) {
  const prepared = await provider.prepareVaultSnapshotUpload(
    access,
    candidate,
    expectedRemoteIdentity,
  );

  if (prepared.status === "not_started") {
    return prepared.outcome;
  }

  return prepared.start().outcome;
}

async function removeVaultSnapshots(
  provider: AwsS3SyncProvider,
  access: SyncAccess,
  vaultId: string,
  expectedRemoteIdentity: VaultSnapshotIdentity | null,
): Promise<void> {
  const prepared = await provider.prepareVaultSnapshotRemoval(
    access,
    vaultId,
    expectedRemoteIdentity,
  );

  if (prepared.status === "ready") {
    await prepared.start().outcome;
  }
}

class HostileSetupInput {
  readonly provider = "aws-s3-v1" as const;
  readonly providerConfig = validProviderConfig();
}

beforeEach(() => {
  vi.clearAllMocks();
  decodedSnapshot = snapshot;
  codec.decodeVaultSnapshotDescriptor.mockImplementation(
    (value: unknown) => value as VaultSnapshotDescriptor,
  );
  codec.decodeVaultSnapshot.mockImplementation(() => decodedSnapshot);
  codec.encodeVaultSnapshotDescriptor.mockImplementation((value) => value);
  codec.encodeVaultSnapshot.mockImplementation((value) => value);
});

describe("AwsS3SyncProvider", () => {
  it("strictly normalizes setup target and credentials", async () => {
    const provider = createTestProvider(createClient());

    await expect(
      provider.setup({
        provider: "aws-s3-v1",
        providerConfig: {
          target: {
            bucket: " bucket-name ",
            region: " eu-central-1 ",
            prefix: " vaults ",
          },
          credentials: {
            accessKeyId: " access-key-id ",
            secretAccessKey: " secret-access-key ",
          },
        },
      }),
    ).resolves.toEqual(syncAccess);
  });

  it.each([
    ["missing setup fields", {}],
    ["nonplain setup record", new HostileSetupInput()],
    [
      "extra setup field",
      {
        provider: "aws-s3-v1",
        providerConfig: validProviderConfig(),
        futureField: true,
      },
    ],
    [
      "unsupported provider",
      { provider: "future-provider", providerConfig: validProviderConfig() },
    ],
    [
      "non-object provider config",
      { provider: "aws-s3-v1", providerConfig: [] },
    ],
    [
      "missing provider-config field",
      {
        provider: "aws-s3-v1",
        providerConfig: { target: validTargetConfig() },
      },
    ],
    [
      "extra provider-config field",
      {
        provider: "aws-s3-v1",
        providerConfig: { ...validProviderConfig(), futureField: true },
      },
    ],
    [
      "non-object target",
      {
        provider: "aws-s3-v1",
        providerConfig: { ...validProviderConfig(), target: Number.NaN },
      },
    ],
    [
      "missing target field",
      {
        provider: "aws-s3-v1",
        providerConfig: {
          ...validProviderConfig(),
          target: { bucket: "bucket-name", region: "eu-central-1" },
        },
      },
    ],
    [
      "wrong target field type",
      {
        provider: "aws-s3-v1",
        providerConfig: {
          ...validProviderConfig(),
          target: { ...validTargetConfig(), bucket: Number.POSITIVE_INFINITY },
        },
      },
    ],
    [
      "extra target field",
      {
        provider: "aws-s3-v1",
        providerConfig: {
          ...validProviderConfig(),
          target: {
            ...validTargetConfig(),
            endpoint: "https://example.test",
          },
        },
      },
    ],
    [
      "invalid target semantics",
      {
        provider: "aws-s3-v1",
        providerConfig: {
          ...validProviderConfig(),
          target: { ...validTargetConfig(), prefix: "../vaults" },
        },
      },
    ],
    [
      "non-object credentials",
      {
        provider: "aws-s3-v1",
        providerConfig: { ...validProviderConfig(), credentials: null },
      },
    ],
    [
      "missing credentials field",
      {
        provider: "aws-s3-v1",
        providerConfig: {
          ...validProviderConfig(),
          credentials: { accessKeyId: "access-key-id" },
        },
      },
    ],
    [
      "wrong credentials field type",
      {
        provider: "aws-s3-v1",
        providerConfig: {
          ...validProviderConfig(),
          credentials: {
            ...validCredentialsConfig(),
            accessKeyId: Number.NaN,
          },
        },
      },
    ],
    [
      "extra credentials field",
      {
        provider: "aws-s3-v1",
        providerConfig: {
          ...validProviderConfig(),
          credentials: {
            ...validCredentialsConfig(),
            sessionToken: "session-token",
          },
        },
      },
    ],
    [
      "invalid credentials semantics",
      {
        provider: "aws-s3-v1",
        providerConfig: {
          ...validProviderConfig(),
          credentials: {
            ...validCredentialsConfig(),
            secretAccessKey: "",
          },
        },
      },
    ],
  ])("rejects %s without creating an AWS client", async (_label, input) => {
    const client = createClient();
    const clientFactory = createClientFactory(client);
    const provider = new AwsS3SyncProvider(
      clientFactory,
      asymmetricKeyValidator,
    );

    const error = await provider
      .setup(input as SyncSetupInput)
      .catch((caught: unknown) => caught);

    expectStaticProviderError(error);
    expect(clientFactory).not.toHaveBeenCalled();
    expectClientNotCalled(client);
  });

  it.each([
    ["missing access fields", {}],
    ["extra access field", { ...syncAccess, futureField: true }],
    [
      "extra target wrapper field",
      { ...syncAccess, target: { ...syncAccess.target, futureField: true } },
    ],
    [
      "unsupported target provider",
      {
        ...syncAccess,
        target: { ...syncAccess.target, provider: "future-provider" },
      },
    ],
    [
      "invalid stored target config",
      {
        ...syncAccess,
        target: { ...syncAccess.target, targetConfig: Number.NaN },
      },
    ],
    [
      "extra credentials wrapper field",
      {
        ...syncAccess,
        credentials: { ...syncAccess.credentials, futureField: true },
      },
    ],
    [
      "unsupported credentials provider",
      {
        ...syncAccess,
        credentials: {
          ...syncAccess.credentials,
          provider: "future-provider",
        },
      },
    ],
    [
      "invalid stored credentials config",
      {
        ...syncAccess,
        credentials: {
          ...syncAccess.credentials,
          credentialsConfig: Number.POSITIVE_INFINITY,
        },
      },
    ],
  ])("rejects %s before any remote call", async (_label, access) => {
    const client = createClient();
    const clientFactory = createClientFactory(client);
    const provider = new AwsS3SyncProvider(
      clientFactory,
      asymmetricKeyValidator,
    );

    const error = await provider
      .getLatestVaultSnapshotDescriptor(
        access as SyncAccess,
        descriptor.vaultId,
      )
      .catch((caught: unknown) => caught);

    expectStaticProviderError(error);
    expect(clientFactory).not.toHaveBeenCalled();
    expectClientNotCalled(client);
  });

  it("uses normalized access and the escaped vault key", async () => {
    const client = createClient();
    vi.mocked(client.getObject).mockRejectedValueOnce(
      awsError("NoSuchKey", 404),
    );
    const clientFactory = createClientFactory(client);
    const provider = new AwsS3SyncProvider(
      clientFactory,
      asymmetricKeyValidator,
    );

    await expect(
      provider.getLatestVaultSnapshotDescriptor(syncAccess, descriptor.vaultId),
    ).resolves.toBeNull();

    expect(clientFactory).toHaveBeenCalledWith(
      {
        bucket: "bucket-name",
        region: "eu-central-1",
        prefix: "vaults/",
      },
      {
        accessKeyId: "access-key-id",
        secretAccessKey: "secret-access-key",
      },
    );
    expect(client.getObject).toHaveBeenCalledWith({
      Bucket: "bucket-name",
      Key: "vaults/vault.enc",
    });
  });

  it("strictly rejects hostile remote records", async () => {
    const client = createClient();
    vi.mocked(client.getObject)
      .mockResolvedValueOnce(responseBody("not-json"))
      .mockResolvedValueOnce(
        responseBody(
          JSON.stringify({
            descriptor,
            snapshot,
            futureField: true,
          }),
        ),
      );
    const provider = createTestProvider(client);

    await expect(
      provider.getLatestVaultSnapshotDescriptor(syncAccess, descriptor.vaultId),
    ).rejects.toBeInstanceOf(codec.InvalidRemoteVaultSnapshotRecordError);
    await expect(
      provider.getLatestVaultSnapshotDescriptor(syncAccess, descriptor.vaultId),
    ).rejects.toBeInstanceOf(codec.InvalidRemoteVaultSnapshotRecordError);
    expect(codec.decodeVaultSnapshot).not.toHaveBeenCalled();
  });

  it("rejects an unapproved outer remote-record version field", async () => {
    const client = createClient();
    vi.mocked(client.getObject).mockResolvedValueOnce(
      responseBody(JSON.stringify({ version: 1, descriptor, snapshot })),
    );
    const provider = createTestProvider(client);

    await expect(
      provider.getLatestVaultSnapshotDescriptor(syncAccess, descriptor.vaultId),
    ).rejects.toBeInstanceOf(codec.InvalidRemoteVaultSnapshotRecordError);
    expect(codec.decodeVaultSnapshotDescriptor).not.toHaveBeenCalled();
  });

  it("rejects a descriptor whose vault differs from the nested snapshot", async () => {
    const client = createClient();
    vi.mocked(client.getObject).mockResolvedValueOnce(
      remoteResponse(descriptor),
    );
    codec.decodeVaultSnapshot.mockReturnValueOnce({
      ...snapshot,
      metadata: { ...snapshot.metadata, id: "other-vault" },
    });
    const provider = createTestProvider(client);

    await expect(
      provider.getLatestVaultSnapshotDescriptor(syncAccess, descriptor.vaultId),
    ).rejects.toBeInstanceOf(codec.InvalidRemoteVaultSnapshotRecordError);
    expect(client.putObject).not.toHaveBeenCalled();
    expect(client.deleteObject).not.toHaveBeenCalled();
  });

  it("propagates a static codec error for hostile nested snapshot data", async () => {
    const client = createClient();
    vi.mocked(client.getObject).mockResolvedValueOnce(
      remoteResponse(descriptor),
    );
    codec.decodeVaultSnapshot.mockImplementationOnce(() => {
      throw new codec.InvalidRemoteVaultSnapshotRecordError();
    });
    const provider = createTestProvider(client);

    await expect(
      provider.getLatestVaultSnapshotDescriptor(syncAccess, descriptor.vaultId),
    ).rejects.toBeInstanceOf(codec.InvalidRemoteVaultSnapshotRecordError);
  });

  it("rejects a remote descriptor that does not describe its snapshot", async () => {
    const client = createClient();
    vi.mocked(client.getObject).mockResolvedValueOnce(
      remoteResponse({
        ...descriptor,
        revisionTimestamp: descriptor.revisionTimestamp + 1,
      }),
    );
    const provider = createTestProvider(client);

    await expect(
      provider.getLatestVaultSnapshotDescriptor(syncAccess, descriptor.vaultId),
    ).rejects.toBeInstanceOf(codec.InvalidRemoteVaultSnapshotRecordError);
  });

  it("rejects a valid record copied under another vault key", async () => {
    const client = createClient();
    vi.mocked(client.getObject).mockResolvedValueOnce(
      remoteResponse(descriptor),
    );
    const provider = createTestProvider(client);

    await expect(
      provider.getLatestVaultSnapshotDescriptor(syncAccess, "another-vault"),
    ).rejects.toBeInstanceOf(codec.InvalidRemoteVaultSnapshotRecordError);
  });

  it("imports certificate and key-slot public keys before returning a descriptor", async () => {
    const client = createClient();
    vi.mocked(client.getObject).mockResolvedValueOnce(
      remoteResponse(descriptor),
    );
    const provider = createTestProvider(client);

    await expect(
      provider.getLatestVaultSnapshotDescriptor(syncAccess, descriptor.vaultId),
    ).resolves.toEqual(descriptor);

    const trustedDevice =
      snapshot.trustChain.certificates[0]?.payload.trustedDevices[0];
    const deviceSlot = snapshot.keySlots.deviceSlots[0];
    expect(trustedDevice).toBeDefined();
    expect(deviceSlot).toBeDefined();
    expect(
      asymmetricKeyValidator.importDeviceSignPublicKey,
    ).toHaveBeenCalledWith(trustedDevice?.publicSignKey);
    expect(
      asymmetricKeyValidator.importDeviceVaultPublicKey,
    ).toHaveBeenNthCalledWith(1, trustedDevice?.publicVaultKey);
    expect(
      asymmetricKeyValidator.importDeviceVaultPublicKey,
    ).toHaveBeenNthCalledWith(2, deviceSlot?.envelope.ephemeralPublicKey);
  });

  it("rejects a valid-length non-importable P-256 key with the default validator", async () => {
    const signKeyPair = await globalThis.crypto.subtle.generateKey(
      { name: "Ed25519" },
      true,
      ["sign", "verify"],
    );
    const vaultKeyPair = await globalThis.crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits"],
    );
    const trustedDevice =
      snapshot.trustChain.certificates[0]?.payload.trustedDevices[0];
    const certificate = snapshot.trustChain.certificates[0];
    const deviceSlot = snapshot.keySlots.deviceSlots[0];

    if (
      !("publicKey" in signKeyPair) ||
      !("publicKey" in vaultKeyPair) ||
      trustedDevice === undefined ||
      certificate === undefined ||
      deviceSlot === undefined
    ) {
      throw new Error("Test asymmetric key fixture could not be created.");
    }

    const nonImportablePoint = new Uint8Array(65);
    nonImportablePoint[0] = 4;
    decodedSnapshot = {
      ...snapshot,
      trustChain: {
        certificates: [
          {
            ...certificate,
            payload: {
              ...certificate.payload,
              trustedDevices: [
                {
                  ...trustedDevice,
                  publicSignKey: (await globalThis.crypto.subtle.exportKey(
                    "raw",
                    signKeyPair.publicKey,
                  )) as DevicePublicSignKey,
                  publicVaultKey: (await globalThis.crypto.subtle.exportKey(
                    "raw",
                    vaultKeyPair.publicKey,
                  )) as DeviceVaultPublicKey,
                },
              ],
            },
          },
        ],
      },
      keySlots: {
        deviceSlots: [
          {
            ...deviceSlot,
            envelope: {
              ...deviceSlot.envelope,
              ephemeralPublicKey:
                nonImportablePoint.buffer as DeviceVaultPublicKey,
            },
          },
        ],
      },
    };
    const client = createClient();
    vi.mocked(client.getObject).mockResolvedValueOnce(
      remoteResponse(descriptor),
    );
    const provider = new AwsS3SyncProvider(createClientFactory(client));

    await expect(
      provider.getLatestVaultSnapshotDescriptor(syncAccess, descriptor.vaultId),
    ).rejects.toBeInstanceOf(codec.InvalidRemoteVaultSnapshotRecordError);
    expect(client.putObject).not.toHaveBeenCalled();
    expect(client.deleteObject).not.toHaveBeenCalled();
  });

  it("returns the requested snapshot and rejects a stale download descriptor", async () => {
    const client = createClient();
    vi.mocked(client.getObject)
      .mockResolvedValueOnce(remoteResponse(descriptor))
      .mockResolvedValueOnce(remoteResponse(descriptor));
    const provider = createTestProvider(client);

    await expect(
      provider.downloadVaultSnapshot(syncAccess, descriptor),
    ).resolves.toEqual(snapshot);
    await expect(
      provider.downloadVaultSnapshot(syncAccess, {
        ...descriptor,
        revisionTimestamp: descriptor.revisionTimestamp - 1,
      }),
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotChangedError);
  });

  it("reports a missing requested snapshot without decoding", async () => {
    const client = createClient();
    vi.mocked(client.getObject).mockRejectedValueOnce(
      awsError("NoSuchKey", 404),
    );
    const provider = createTestProvider(client);

    await expect(
      provider.downloadVaultSnapshot(syncAccess, descriptor),
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotNotFoundError);
    expect(codec.decodeVaultSnapshot).not.toHaveBeenCalled();
  });

  it("creates the current record only when the object is absent", async () => {
    const client = createClient();
    const provider = createTestProvider(client);

    await expect(
      uploadVaultSnapshot(provider, syncAccess, snapshot, null),
    ).resolves.toEqual({ status: "committed" });

    expect(client.getObject).not.toHaveBeenCalled();
    expect(client.putObject).toHaveBeenCalledWith({
      Bucket: "bucket-name",
      Key: "vaults/vault.enc",
      Body: JSON.stringify({ descriptor, snapshot }),
      ContentType: "application/json",
      IfNoneMatch: "*",
    });
  });

  it("replaces a matching object using its ETag", async () => {
    const client = createClient();
    vi.mocked(client.getObject).mockResolvedValueOnce(
      remoteResponse(descriptor, '"remote-etag"'),
    );
    const provider = createTestProvider(client);

    const prepared = await provider.prepareVaultSnapshotUpload(
      syncAccess,
      snapshot,
      expectedRemoteSnapshotIdentity,
    );

    expect(client.getObject).toHaveBeenCalledOnce();
    expect(client.putObject).not.toHaveBeenCalled();
    expect(prepared.status).toBe("ready");

    if (prepared.status !== "ready") {
      throw new Error("Expected a prepared conditional upload.");
    }

    const started = prepared.start();
    expect(client.putObject).toHaveBeenCalledOnce();
    await expect(started.outcome).resolves.toEqual({ status: "committed" });

    expect(client.putObject).toHaveBeenCalledWith(
      expect.objectContaining({ IfMatch: '"remote-etag"' }),
    );
  });

  it("does not replace a same-descriptor object with a different digest", async () => {
    const client = createClient();
    vi.mocked(client.getObject).mockResolvedValueOnce(
      remoteResponse(descriptor, '"remote-etag"'),
    );
    const provider = createTestProvider(client, "substituted-snapshot-digest");

    await expect(
      uploadVaultSnapshot(
        provider,
        syncAccess,
        snapshot,
        expectedRemoteSnapshotIdentity,
      ),
    ).resolves.toEqual({
      status: "definitely_not_committed",
      reason: "remote_snapshot_changed",
    });
    expect(client.putObject).not.toHaveBeenCalled();
  });

  it("classifies a mismatched upload before requiring an ETag", async () => {
    const client = createClient();
    vi.mocked(client.getObject).mockResolvedValueOnce(
      remoteResponse(descriptor),
    );
    const provider = createTestProvider(client, "substituted-snapshot-digest");

    await expect(
      uploadVaultSnapshot(
        provider,
        syncAccess,
        snapshot,
        expectedRemoteSnapshotIdentity,
      ),
    ).resolves.toEqual({
      status: "definitely_not_committed",
      reason: "remote_snapshot_changed",
    });
    expect(client.putObject).not.toHaveBeenCalled();
  });

  it("rejects a matching upload record without an ETag before writing", async () => {
    const client = createClient();
    vi.mocked(client.getObject).mockResolvedValueOnce(
      remoteResponse(descriptor),
    );
    const provider = createTestProvider(client);

    await expect(
      provider.prepareVaultSnapshotUpload(
        syncAccess,
        snapshot,
        expectedRemoteSnapshotIdentity,
      ),
    ).rejects.toBeInstanceOf(codec.InvalidRemoteVaultSnapshotRecordError);
    expect(client.putObject).not.toHaveBeenCalled();
  });

  it("reports a mismatched expected vault as definitely not committed before remote access", async () => {
    const client = createClient();
    const provider = createTestProvider(client);

    await expect(
      uploadVaultSnapshot(provider, syncAccess, snapshot, {
        ...expectedRemoteSnapshotIdentity,
        descriptor: {
          ...descriptor,
          vaultId: "other-vault",
        },
      }),
    ).resolves.toEqual({
      status: "definitely_not_committed",
      reason: "remote_snapshot_changed",
    });
    expect(client.getObject).not.toHaveBeenCalled();
    expect(client.putObject).not.toHaveBeenCalled();
  });

  it.each([
    ["precondition failure", "PreconditionFailed", 412],
    ["conditional conflict", "ConditionalRequestConflict", 409],
    ["concurrent removal", "NoSuchKey", 404],
  ])(
    "maps a single-attempt %s to a definite non-commit",
    async (_case, name, status) => {
      const client = createClient();
      vi.mocked(client.getObject).mockResolvedValueOnce(
        remoteResponse(descriptor, '"remote-etag"'),
      );
      vi.mocked(client.putObject).mockRejectedValueOnce(
        awsError(name, status, 1),
      );
      const provider = createTestProvider(client);

      await expect(
        uploadVaultSnapshot(
          provider,
          syncAccess,
          snapshot,
          expectedRemoteSnapshotIdentity,
        ),
      ).resolves.toEqual({
        status: "definitely_not_committed",
        reason: "remote_snapshot_changed",
      });
    },
  );

  it.each([
    ["missing bucket", "NoSuchBucket", 404],
    ["authorization rejection", "AccessDenied", 403],
    ["invalid request", "InvalidRequest", 400],
  ])(
    "maps a single-attempt %s to a definite provider rejection",
    async (_case, name, status) => {
      const client = createClient();
      vi.mocked(client.getObject).mockResolvedValueOnce(
        remoteResponse(descriptor, '"remote-etag"'),
      );
      vi.mocked(client.putObject).mockRejectedValueOnce(
        awsError(name, status, 1),
      );
      const provider = createTestProvider(client);

      await expect(
        uploadVaultSnapshot(
          provider,
          syncAccess,
          snapshot,
          expectedRemoteSnapshotIdentity,
        ),
      ).resolves.toEqual({
        status: "definitely_not_committed",
        reason: "provider_rejected",
      });
    },
  );

  it.each([
    ["missing attempt metadata", undefined],
    ["multiple attempts", 2],
  ])(
    "keeps a conditional failure outcome unknown with %s",
    async (_case, attempts) => {
      const client = createClient();
      vi.mocked(client.getObject).mockResolvedValueOnce(
        remoteResponse(descriptor, '"remote-etag"'),
      );
      vi.mocked(client.putObject).mockRejectedValueOnce(
        awsError("PreconditionFailed", 412, attempts),
      );
      const provider = createTestProvider(client);

      await expect(
        uploadVaultSnapshot(
          provider,
          syncAccess,
          snapshot,
          expectedRemoteSnapshotIdentity,
        ),
      ).resolves.toEqual({ status: "outcome_unknown" });
    },
  );

  it("keeps a generic put failure outcome unknown", async () => {
    const client = createClient();
    vi.mocked(client.getObject).mockResolvedValueOnce(
      remoteResponse(descriptor, '"remote-etag"'),
    );
    vi.mocked(client.putObject).mockRejectedValueOnce(
      new Error("network unavailable"),
    );
    const provider = createTestProvider(client);

    await expect(
      uploadVaultSnapshot(
        provider,
        syncAccess,
        snapshot,
        expectedRemoteSnapshotIdentity,
      ),
    ).resolves.toEqual({ status: "outcome_unknown" });
  });

  it.each([
    ["status-only conflict", 409],
    ["status-only not found", 404],
  ])(
    "maps a single-attempt conditional %s to a remote change",
    async (_case, status) => {
      const client = createClient();
      vi.mocked(client.getObject).mockResolvedValueOnce(
        remoteResponse(descriptor, '"remote-etag"'),
      );
      vi.mocked(client.putObject).mockRejectedValueOnce({
        $metadata: { httpStatusCode: status, attempts: 1 },
      });
      const provider = createTestProvider(client);

      await expect(
        uploadVaultSnapshot(
          provider,
          syncAccess,
          snapshot,
          expectedRemoteSnapshotIdentity,
        ),
      ).resolves.toEqual({
        status: "definitely_not_committed",
        reason: "remote_snapshot_changed",
      });
    },
  );

  it.each([
    ["request timeout", "RequestTimeout", 400],
    ["rate limit", "TooManyRequests", 429],
  ])(
    "keeps a single-attempt %s outcome unknown",
    async (_case, name, status) => {
      const client = createClient();
      vi.mocked(client.getObject).mockResolvedValueOnce(
        remoteResponse(descriptor, '"remote-etag"'),
      );
      vi.mocked(client.putObject).mockRejectedValueOnce(
        awsError(name, status, 1),
      );
      const provider = createTestProvider(client);

      await expect(
        uploadVaultSnapshot(
          provider,
          syncAccess,
          snapshot,
          expectedRemoteSnapshotIdentity,
        ),
      ).resolves.toEqual({ status: "outcome_unknown" });
    },
  );

  it("keeps a retried provider rejection outcome unknown", async () => {
    const client = createClient();
    vi.mocked(client.getObject).mockResolvedValueOnce(
      remoteResponse(descriptor, '"remote-etag"'),
    );
    vi.mocked(client.putObject).mockRejectedValueOnce(
      awsError("NoSuchBucket", 404, 2),
    );
    const provider = createTestProvider(client);

    await expect(
      uploadVaultSnapshot(
        provider,
        syncAccess,
        snapshot,
        expectedRemoteSnapshotIdentity,
      ),
    ).resolves.toEqual({ status: "outcome_unknown" });
  });

  it("keeps the outcome unknown when a hostile put rejection cannot be inspected", async () => {
    const client = createClient();
    vi.mocked(client.getObject).mockResolvedValueOnce(
      remoteResponse(descriptor, '"remote-etag"'),
    );
    const hostileError = Object.defineProperty({}, "$metadata", {
      get() {
        throw new Error("metadata access denied");
      },
    });
    vi.mocked(client.putObject).mockRejectedValueOnce(hostileError);
    const provider = createTestProvider(client);

    await expect(
      uploadVaultSnapshot(
        provider,
        syncAccess,
        snapshot,
        expectedRemoteSnapshotIdentity,
      ),
    ).resolves.toEqual({ status: "outcome_unknown" });
  });

  it("reports outcome unknown when the remote commit succeeds before the local response fails", async () => {
    const client = createClient();
    let remoteCommitted = false;
    vi.mocked(client.putObject).mockImplementationOnce(async () => {
      remoteCommitted = true;
      throw new Error("response lost after commit");
    });
    vi.mocked(client.getObject).mockImplementationOnce(async () => {
      if (!remoteCommitted) {
        throw awsError("NoSuchKey", 404, 1);
      }

      return remoteResponse(descriptor, '"committed-etag"');
    });
    const provider = createTestProvider(client);

    await expect(
      uploadVaultSnapshot(provider, syncAccess, snapshot, null),
    ).resolves.toEqual({ status: "outcome_unknown" });
    await expect(
      provider.getLatestVaultSnapshotDescriptor(syncAccess, descriptor.vaultId),
    ).resolves.toEqual(descriptor);
  });

  it("conditionally removes matching state and treats absence as success", async () => {
    const client = createClient();
    vi.mocked(client.getObject)
      .mockResolvedValueOnce(remoteResponse(descriptor, '"remote-etag"'))
      .mockRejectedValueOnce(awsError("NoSuchKey", 404));
    const provider = createTestProvider(client);

    const prepared = await provider.prepareVaultSnapshotRemoval(
      syncAccess,
      descriptor.vaultId,
      expectedRemoteSnapshotIdentity,
    );

    expect(client.getObject).toHaveBeenCalledOnce();
    expect(client.deleteObject).not.toHaveBeenCalled();
    expect(prepared.status).toBe("ready");

    if (prepared.status !== "ready") {
      throw new Error("Expected a prepared conditional removal.");
    }

    const started = prepared.start();
    expect(client.deleteObject).toHaveBeenCalledOnce();
    await started.outcome;
    await removeVaultSnapshots(
      provider,
      syncAccess,
      descriptor.vaultId,
      expectedRemoteSnapshotIdentity,
    );

    expect(client.deleteObject).toHaveBeenCalledOnce();
    expect(client.deleteObject).toHaveBeenCalledWith({
      Bucket: "bucket-name",
      Key: "vaults/vault.enc",
      IfMatch: '"remote-etag"',
    });
  });

  it("rejects a matching removal record without an ETag before deleting", async () => {
    const client = createClient();
    vi.mocked(client.getObject).mockResolvedValueOnce(
      remoteResponse(descriptor),
    );
    const provider = createTestProvider(client);

    await expect(
      provider.prepareVaultSnapshotRemoval(
        syncAccess,
        descriptor.vaultId,
        expectedRemoteSnapshotIdentity,
      ),
    ).rejects.toBeInstanceOf(codec.InvalidRemoteVaultSnapshotRecordError);
    expect(client.deleteObject).not.toHaveBeenCalled();
  });

  it("does not delete state when the expected descriptor is absent", async () => {
    const client = createClient();
    vi.mocked(client.getObject).mockResolvedValueOnce(
      remoteResponse(descriptor, '"remote-etag"'),
    );
    const provider = createTestProvider(client);

    await expect(
      removeVaultSnapshots(provider, syncAccess, descriptor.vaultId, null),
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotChangedError);
    expect(client.deleteObject).not.toHaveBeenCalled();
  });

  it("does not delete same-descriptor state with a different digest", async () => {
    const client = createClient();
    vi.mocked(client.getObject).mockResolvedValueOnce(
      remoteResponse(descriptor, '"remote-etag"'),
    );
    const provider = createTestProvider(client, "different-snapshot-digest");

    await expect(
      removeVaultSnapshots(
        provider,
        syncAccess,
        descriptor.vaultId,
        expectedRemoteSnapshotIdentity,
      ),
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotChangedError);
    expect(client.deleteObject).not.toHaveBeenCalled();
  });

  it("classifies a mismatched removal before requiring an ETag", async () => {
    const client = createClient();
    vi.mocked(client.getObject).mockResolvedValueOnce(
      remoteResponse(descriptor),
    );
    const provider = createTestProvider(client, "different-snapshot-digest");

    await expect(
      removeVaultSnapshots(
        provider,
        syncAccess,
        descriptor.vaultId,
        expectedRemoteSnapshotIdentity,
      ),
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotChangedError);
    expect(client.deleteObject).not.toHaveBeenCalled();
  });

  it("does not delete a matching descriptor for a different requested vault", async () => {
    const client = createClient();
    vi.mocked(client.getObject).mockResolvedValueOnce(
      remoteResponse(descriptor, '"remote-etag"'),
    );
    const provider = createTestProvider(client);

    await expect(
      removeVaultSnapshots(
        provider,
        syncAccess,
        "other-vault",
        expectedRemoteSnapshotIdentity,
      ),
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotChangedError);
    expect(client.deleteObject).not.toHaveBeenCalled();
  });

  it("maps only definitive credential rejection and propagates ambiguous authorization failures", async () => {
    const client = createClient();
    const accessibleBody = responseBody("{").Body;
    const bareUnauthorized = awsError("UnknownProviderFailure", 401);
    const bareForbidden = awsError("UnknownProviderFailure", 403);
    const accessDenied = awsError("AccessDenied", 403);
    const signatureMismatch = awsError("SignatureDoesNotMatch", 403);
    const networkError = new Error("network unavailable");
    const rateLimitError = awsError("SlowDown", 429);
    vi.mocked(client.getObject)
      .mockResolvedValueOnce({ Body: accessibleBody })
      .mockRejectedValueOnce(awsError("InvalidAccessKeyId", 403))
      .mockRejectedValueOnce(awsError("NoSuchKey", 404))
      .mockRejectedValueOnce(bareUnauthorized)
      .mockRejectedValueOnce(bareForbidden)
      .mockRejectedValueOnce(accessDenied)
      .mockRejectedValueOnce(signatureMismatch)
      .mockRejectedValueOnce(networkError)
      .mockRejectedValueOnce(rateLimitError);
    const provider = createTestProvider(client);

    await expect(
      provider.checkVaultAccess(syncAccess, descriptor.vaultId),
    ).resolves.toBe("accessible");
    expect(accessibleBody?.transformToString).toHaveBeenCalledOnce();
    await expect(
      provider.checkVaultAccess(syncAccess, descriptor.vaultId),
    ).resolves.toBe("authentication_rejected");
    await expect(
      provider.checkVaultAccess(syncAccess, descriptor.vaultId),
    ).resolves.toBe("accessible");
    await expect(
      provider.checkVaultAccess(syncAccess, descriptor.vaultId),
    ).rejects.toBe(bareUnauthorized);
    await expect(
      provider.checkVaultAccess(syncAccess, descriptor.vaultId),
    ).rejects.toBe(bareForbidden);
    await expect(
      provider.checkVaultAccess(syncAccess, descriptor.vaultId),
    ).rejects.toBe(accessDenied);
    await expect(
      provider.checkVaultAccess(syncAccess, descriptor.vaultId),
    ).rejects.toBe(signatureMismatch);
    await expect(
      provider.checkVaultAccess(syncAccess, descriptor.vaultId),
    ).rejects.toBe(networkError);
    await expect(
      provider.checkVaultAccess(syncAccess, descriptor.vaultId),
    ).rejects.toBe(rateLimitError);
    expect(client.getObject).toHaveBeenNthCalledWith(1, {
      Bucket: "bucket-name",
      Key: "vaults/vault.enc",
      Range: "bytes=0-0",
    });
  });
});

function createClient(): S3SyncClient {
  return {
    getObject: vi.fn(),
    putObject: vi.fn(),
    deleteObject: vi.fn(),
  };
}

function createClientFactory(client: S3SyncClient): S3SyncClientFactory {
  return vi.fn(() => client);
}

function createTestProvider(
  client: S3SyncClient,
  remoteSnapshotDigest = snapshotDigest,
): AwsS3SyncProvider {
  return new AwsS3SyncProvider(
    createClientFactory(client),
    asymmetricKeyValidator,
    { digestVaultSnapshot: vi.fn(async () => remoteSnapshotDigest) },
  );
}

function validTargetConfig() {
  return {
    bucket: "bucket-name",
    region: "eu-central-1",
    prefix: "vaults",
  };
}

function validCredentialsConfig() {
  return {
    accessKeyId: "access-key-id",
    secretAccessKey: "secret-access-key",
  };
}

function validProviderConfig() {
  return {
    target: validTargetConfig(),
    credentials: validCredentialsConfig(),
  };
}

function expectStaticProviderError(
  value: unknown,
): asserts value is InvalidSyncProviderResponseError {
  expect(value).toBeInstanceOf(InvalidSyncProviderResponseError);

  if (!(value instanceof InvalidSyncProviderResponseError)) {
    throw new Error("Expected a sync-provider response error.");
  }

  expect(value.name).toBe("InvalidSyncProviderResponseError");
  expect(value.message).toBe("Sync provider response is malformed.");
  expect(Object.prototype.hasOwnProperty.call(value, "cause")).toBe(false);
  expect(Object.prototype.hasOwnProperty.call(value, "input")).toBe(false);
}

function expectClientNotCalled(client: S3SyncClient): void {
  expect(client.getObject).not.toHaveBeenCalled();
  expect(client.putObject).not.toHaveBeenCalled();
  expect(client.deleteObject).not.toHaveBeenCalled();
}

function responseBody(value: string, etag?: string) {
  return {
    Body: {
      transformToString: vi.fn(async () => value),
    },
    ...(etag === undefined ? {} : { ETag: etag }),
  };
}

function remoteResponse(
  remoteDescriptor: VaultSnapshotDescriptor,
  etag?: string,
) {
  return responseBody(
    JSON.stringify({
      descriptor: remoteDescriptor,
      snapshot,
    }),
    etag,
  );
}

function awsError(name: string, httpStatusCode: number, attempts?: number) {
  return Object.assign(new Error(name), {
    name,
    $metadata: {
      httpStatusCode,
      ...(attempts === undefined ? {} : { attempts }),
    },
  });
}
