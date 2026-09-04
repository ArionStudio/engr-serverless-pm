import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CompleteProviderCredentialRevocationUseCase,
  type DeviceLocalProtectionKey,
  type DeviceSyncCredentialEncryptionContext,
  type DeviceSyncCredentialState,
  type EncryptedDeviceSyncCredentialState,
} from "@lfspm/core";
import { encodeBase64Url } from "@lfspm/core/lib";
import { canonicalize } from "json-canonicalize";
import { createUnlockVaultTestContext } from "../../../../../packages/core/src/__tests__/fixtures/unlock-vault";
import { createUnlockedVaultWithEntries } from "../../../../../packages/core/src/__tests__/fixtures/vault-entries";
import { VaultSnapshotService } from "../../../../../packages/core/src/services/snapshot/vault-snapshot.service";
import { VaultSyncGuardService } from "../../../../../packages/core/src/services/sync/vault-sync-guard.service";
import {
  createVaultManagerDb,
  type VaultManagerDb,
} from "../../infrastructure/database/dexie-db";
import { IndexedDbVaultLocalRepositoryAdapter } from "../storage";
import {
  decodeDeviceSyncCredentialState,
  encodeDeviceSyncCredentialState,
} from "../codecs/sync-credential.codec";
import { InvalidDeviceSyncCredentialStateError } from "./index";
import { WebCryptoAdapter } from "./web-crypto.adapter";

const candidateSnapshotDigest = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const expectedRemoteSnapshotDigest =
  "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBA";

const textEncoder = new TextEncoder();
const syncContext: DeviceSyncCredentialEncryptionContext = {
  vaultId: "vault-id",
  deviceId: "device-id",
  provider: "aws-s3-v1",
  target: {
    provider: "aws-s3-v1",
    targetConfig: {
      bucket: "bucket",
      prefix: "vault/",
      region: "eu-west-1",
    },
  },
};

let databaseCounter = 0;
let database: VaultManagerDb | undefined;

afterEach(async () => {
  await database?.delete();
  database = undefined;
});

describe("WebCrypto device sync credential state boundary", () => {
  it.each([
    [
      "non-finite JSON",
      {
        currentCredentials: {
          provider: "aws-s3-v1",
          credentialsConfig: { timeout: Number.POSITIVE_INFINITY },
        },
      },
    ],
    [
      "extra credential field",
      {
        currentCredentials: {
          provider: "aws-s3-v1",
          credentialsConfig: {},
          futureField: true,
        },
      },
    ],
  ] as const)("rejects %s on the encoder write path", (_label, state) => {
    expect(() =>
      encodeDeviceSyncCredentialState(state as DeviceSyncCredentialState),
    ).toThrow(InvalidDeviceSyncCredentialStateError);
  });

  it("rebuilds the encoded credential state without retaining input references", () => {
    const credentialsConfig = { region: "eu-west-1" };
    const state: DeviceSyncCredentialState = {
      currentCredentials: {
        provider: "aws-s3-v1",
        credentialsConfig,
      },
    };
    const encoded = encodeDeviceSyncCredentialState(state);
    credentialsConfig.region = "changed-after-encode";

    expect(encoded).toEqual({
      currentCredentials: {
        provider: "aws-s3-v1",
        credentialsConfig: { region: "eu-west-1" },
      },
    });
  });

  it("round-trips the exact pending snapshot upload reconciliation intent", () => {
    const state: DeviceSyncCredentialState = {
      ...validCredentialState(),
      pendingSnapshotUpload: {
        candidateSnapshotIdentity: {
          descriptor: {
            vaultId: "vault-id",
            snapshotVersionVector: { "device-id": 2 },
            revisionTimestamp: 20,
          },
          snapshotDigest: candidateSnapshotDigest,
        },
        expectedRemoteSnapshotIdentity: {
          descriptor: {
            vaultId: "vault-id",
            snapshotVersionVector: { "device-id": 1 },
            revisionTimestamp: 10,
          },
          snapshotDigest: expectedRemoteSnapshotDigest,
        },
      },
    };

    expect(
      decodeDeviceSyncCredentialState(encodeDeviceSyncCredentialState(state)),
    ).toEqual(state);
  });

  it("rejects a non-JSON credentials configuration object", () => {
    expect(() =>
      decodeDeviceSyncCredentialState({
        currentCredentials: {
          provider: "aws-s3-v1",
          credentialsConfig: new Date(0),
        },
      }),
    ).toThrow(InvalidDeviceSyncCredentialStateError);
  });

  it("round-trips the complete current and previous credential state", async () => {
    const crypto = new WebCryptoAdapter();
    const key = await crypto.generateDeviceLocalProtectionKey();
    const state = validCredentialState();

    const encrypted = await crypto.encryptDeviceSyncCredentialState(
      state,
      key,
      syncContext,
    );

    await expect(
      crypto.decryptDeviceSyncCredentialState(encrypted, key, syncContext),
    ).resolves.toEqual(state);
  });

  it.each([
    ["missing current credentials", {}],
    ["wrong current credentials type", { currentCredentials: "wrong" }],
    ["extra outer field", { ...validCredentialState(), futureField: true }],
    [
      "unsupported current provider",
      {
        currentCredentials: {
          provider: "future-provider",
          credentialsConfig: {},
        },
      },
    ],
    [
      "unsupported previous provider",
      {
        ...validCredentialState(),
        previousCredentials: {
          ...validCredentialState().previousCredentials,
          credentials: {
            provider: "future-provider",
            credentialsConfig: {},
          },
        },
      },
    ],
    [
      "duplicate revoked identity",
      {
        ...validCredentialState(),
        previousCredentials: {
          ...validCredentialState().previousCredentials,
          revokedDeviceIds: ["revoked-device", "revoked-device"],
        },
      },
    ],
    [
      "blank revoked identity",
      {
        ...validCredentialState(),
        previousCredentials: {
          ...validCredentialState().previousCredentials,
          revokedDeviceIds: ["   "],
        },
      },
    ],
    ["zero generation", withPreviousGeneration(0)],
    ["negative generation", withPreviousGeneration(-1)],
    ["fractional generation", withPreviousGeneration(1.5)],
    ["unsafe generation", withPreviousGeneration(9_007_199_254_740_992)],
    [
      "extra nested credential field",
      {
        currentCredentials: {
          ...validCredentialState().currentCredentials,
          futureField: true,
        },
      },
    ],
    [
      "extra pending upload field",
      {
        ...validCredentialState(),
        pendingSnapshotUpload: {
          candidateSnapshotIdentity: {
            descriptor: {
              vaultId: "vault-id",
              snapshotVersionVector: { "device-id": 2 },
              revisionTimestamp: 20,
            },
            snapshotDigest: candidateSnapshotDigest,
          },
          expectedRemoteSnapshotIdentity: null,
          futureField: true,
        },
      },
    ],
    [
      "blank pending upload candidate digest",
      {
        ...validCredentialState(),
        pendingSnapshotUpload: {
          candidateSnapshotIdentity: {
            descriptor: {
              vaultId: "vault-id",
              snapshotVersionVector: { "device-id": 2 },
              revisionTimestamp: 20,
            },
            snapshotDigest: "   ",
          },
          expectedRemoteSnapshotIdentity: null,
        },
      },
    ],
    [
      "wrong-length pending upload candidate digest",
      {
        ...validCredentialState(),
        pendingSnapshotUpload: {
          candidateSnapshotIdentity: {
            descriptor: {
              vaultId: "vault-id",
              snapshotVersionVector: { "device-id": 2 },
              revisionTimestamp: 20,
            },
            snapshotDigest: "AAAA",
          },
          expectedRemoteSnapshotIdentity: null,
        },
      },
    ],
    [
      "noncanonical pending upload candidate digest",
      {
        ...validCredentialState(),
        pendingSnapshotUpload: {
          candidateSnapshotIdentity: {
            descriptor: {
              vaultId: "vault-id",
              snapshotVersionVector: { "device-id": 2 },
              revisionTimestamp: 20,
            },
            snapshotDigest: `${candidateSnapshotDigest}=`,
          },
          expectedRemoteSnapshotIdentity: null,
        },
      },
    ],
  ] as const)(
    "rejects authenticated plaintext with %s",
    async (_label, value) => {
      const crypto = new WebCryptoAdapter();
      const key = await crypto.generateDeviceLocalProtectionKey();
      const encrypted = await encryptAuthenticatedPlaintext(
        JSON.stringify(value),
        key,
        syncContext,
      );

      await expectInvalidDeviceSyncCredentialState(
        crypto.decryptDeviceSyncCredentialState(encrypted, key, syncContext),
      );
    },
  );

  it.each([
    [
      "non-finite nested JSON number",
      '{"currentCredentials":{"provider":"aws-s3-v1","credentialsConfig":{"timeout":1e400}}}',
    ],
    [
      "malformed nested JSON",
      '{"currentCredentials":{"provider":"aws-s3-v1","credentialsConfig":{"timeout":}}}',
    ],
  ] as const)("rejects authenticated %s", async (_label, plaintext) => {
    const crypto = new WebCryptoAdapter();
    const key = await crypto.generateDeviceLocalProtectionKey();
    const encrypted = await encryptAuthenticatedPlaintext(
      plaintext,
      key,
      syncContext,
    );

    await expectInvalidDeviceSyncCredentialState(
      crypto.decryptDeviceSyncCredentialState(encrypted, key, syncContext),
    );
  });

  it("prevents provider calls, writes, and session mutation after authenticated plaintext decode fails", async () => {
    const ctx = createUnlockVaultTestContext();
    const crypto = new WebCryptoAdapter();
    const key = await crypto.generateDeviceLocalProtectionKey();
    databaseCounter += 1;
    database = createVaultManagerDb(`lfspm-sync-state-${databaseCounter}`);
    const repository = new IndexedDbVaultLocalRepositoryAdapter(database);
    const unlockedVault = createUnlockedVaultWithEntries(ctx.values, []);
    ctx.saved.unlockedVaultSession = {
      sessionId: ctx.values.sessionId,
      unlockedVault: {
        ...unlockedVault,
        deviceLocalProtectionKey: key,
        vault: {
          ...unlockedVault.vault,
          syncTarget: syncContext.target,
          providerCredentialRevocationPending: {
            revokedDeviceIds: [ctx.values.pendingDeviceId],
            vaultKeyGeneration: 1,
          },
        },
      },
      sourceSnapshotVersionVector:
        ctx.vaultSnapshot.metadata.snapshotVersionVector,
    };
    const malformedState = await encryptAuthenticatedPlaintext(
      JSON.stringify({
        ...validCredentialState(),
        previousCredentials: {
          ...validCredentialState().previousCredentials,
          revokedDeviceIds: ["duplicate", "duplicate"],
        },
      }),
      key,
      syncContext,
    );
    await repository.saveDeviceSyncCredentialState(
      ctx.values.vaultId,
      malformedState,
    );
    const snapshot = new VaultSnapshotService(
      crypto,
      ctx.ports.clock,
      repository,
    );
    const guard = new VaultSyncGuardService(
      ctx.ports.syncProvider,
      snapshot,
      ctx.ports.sessionServices.unlockedVaultSession,
      crypto,
      repository,
    );
    const useCase = new CompleteProviderCredentialRevocationUseCase(
      crypto,
      ctx.ports.syncProvider,
      ctx.ports.sessionServices.unlockedVaultSession,
      snapshot,
      repository,
      guard,
    );
    const decrypt = vi.spyOn(crypto, "decryptDeviceSyncCredentialState");
    const saveCredential = vi.spyOn(
      repository,
      "saveDeviceSyncCredentialState",
    );
    const saveSnapshot = vi.spyOn(
      repository,
      "saveVaultSnapshotWithCheckpoint",
    );
    const persistSession = vi.spyOn(
      ctx.ports.sessionServices.unlockedVaultSession,
      "persistForActiveSession",
    );
    const commitSession = vi.spyOn(
      ctx.ports.sessionServices.unlockedVaultSession,
      "commitPersistedSnapshot",
    );

    await expectInvalidDeviceSyncCredentialState(
      useCase.execute({ vaultId: ctx.values.vaultId }),
    );
    expect(decrypt).toHaveBeenCalledTimes(1);
    expect(ctx.ports.syncProvider.checkVaultAccess).not.toHaveBeenCalled();
    expect(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
    expect(saveCredential).not.toHaveBeenCalled();
    expect(saveSnapshot).not.toHaveBeenCalled();
    expect(persistSession).not.toHaveBeenCalled();
    expect(commitSession).not.toHaveBeenCalled();
    await expect(
      repository.getDeviceSyncCredentialState(ctx.values.vaultId),
    ).resolves.toEqual(malformedState);
  });
});

function validCredentialState(): DeviceSyncCredentialState {
  return {
    currentCredentials: {
      provider: "aws-s3-v1",
      credentialsConfig: {
        accessKeyId: "replacement-access-key",
        secretAccessKey: "replacement-secret-key",
      },
    },
    previousCredentials: {
      credentials: {
        provider: "aws-s3-v1",
        credentialsConfig: {
          accessKeyId: "old-access-key",
          secretAccessKey: "old-secret-key",
        },
      },
      revokedDeviceIds: ["revoked-device"],
      vaultKeyGeneration: 2,
    },
  };
}

function withPreviousGeneration(generation: number): unknown {
  return {
    ...validCredentialState(),
    previousCredentials: {
      ...validCredentialState().previousCredentials,
      vaultKeyGeneration: generation,
    },
  };
}

async function encryptAuthenticatedPlaintext(
  plaintext: string,
  keyBytes: DeviceLocalProtectionKey,
  context: DeviceSyncCredentialEncryptionContext,
): Promise<EncryptedDeviceSyncCredentialState> {
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const nonce = Uint8Array.from({ length: 12 }, (_, index) => index + 1);
  const additionalData = textEncoder.encode(
    canonicalize({
      purpose: "lfspm-device-sync-credential-state-v1",
      context,
    }),
  );
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: nonce,
      additionalData,
      tagLength: 128,
    },
    key,
    textEncoder.encode(plaintext),
  );

  return {
    ciphertext: encodeBase64Url(new Uint8Array(ciphertext)),
    encryptionNonce: encodeBase64Url(nonce),
  };
}

async function expectInvalidDeviceSyncCredentialState(
  operation: Promise<unknown>,
): Promise<void> {
  let thrown: unknown;

  try {
    await operation;
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(InvalidDeviceSyncCredentialStateError);
  expect(thrown).toMatchObject({
    name: "InvalidDeviceSyncCredentialStateError",
    message: "Device sync credential state is malformed.",
  });
  expect(Object.hasOwn(record(thrown), "cause")).toBe(false);
  expect(Object.hasOwn(record(thrown), "input")).toBe(false);
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Expected a record in the test fixture.");
  }

  return value as Record<string, unknown>;
}
