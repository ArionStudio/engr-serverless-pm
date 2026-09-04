import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  EncryptedUnlockedVaultSessionPayload,
  VersionVector,
} from "@lfspm/core";
import { encodeBase64Url } from "@lfspm/core/lib";
import { createCoreTestPorts } from "../../../../../packages/core/src/__tests__/fixtures/ports";
import { createCoreTestValues } from "../../../../../packages/core/src/__tests__/fixtures/values";
import { UnlockedVaultSessionService } from "../../../../../packages/core/src/services/session/unlocked-vault-session.service";
import {
  ACTIVE_UNLOCKED_VAULT_SESSION_PAYLOAD_ID,
  createVaultManagerDb,
  type EncryptedUnlockedVaultSessionPayloadRecord,
  type VaultManagerDb,
} from "../../infrastructure/database/dexie-db";
import { IndexedDbEncryptedUnlockedVaultSessionPayloadRepositoryAdapter } from "./indexeddb-encrypted-unlocked-vault-session-payload-repository.adapter";
import { InvalidUnlockedVaultSessionPayloadRecordError } from "../codecs/unlocked-session-payload.codec";

let databaseCounter = 0;
let database: VaultManagerDb | undefined;

class HostileStoredPayloadRecord {
  readonly id = ACTIVE_UNLOCKED_VAULT_SESSION_PAYLOAD_ID;
  readonly sessionId = "session-id";
  readonly vaultId = "vault-id";
  readonly sourceSnapshotVersionVector = { "device-id": 7 };
  readonly content = encryptedContent();
}

function createContext() {
  databaseCounter += 1;
  database = createVaultManagerDb(`lfspm-extension-test-${databaseCounter}`);

  return {
    database,
    repository:
      new IndexedDbEncryptedUnlockedVaultSessionPayloadRepositoryAdapter(
        database,
      ),
  };
}

afterEach(async () => {
  await database?.delete();
  database = undefined;
});

describe("IndexedDbEncryptedUnlockedVaultSessionPayloadRepositoryAdapter", () => {
  it("saves one active encrypted payload record", async () => {
    const ctx = createContext();
    const payload = createPayload({ "device-id": 7 });

    await ctx.repository.saveEncryptedUnlockedVaultSessionPayload(payload);

    await expect(
      ctx.database.encryptedUnlockedVaultSessionPayloads.get(
        ACTIVE_UNLOCKED_VAULT_SESSION_PAYLOAD_ID,
      ),
    ).resolves.toEqual({
      id: ACTIVE_UNLOCKED_VAULT_SESSION_PAYLOAD_ID,
      ...payload,
    });
  });

  it("replaces the active encrypted payload record", async () => {
    const ctx = createContext();

    await ctx.repository.saveEncryptedUnlockedVaultSessionPayload(
      createPayload({ "device-id": 7 }),
    );
    await ctx.repository.saveEncryptedUnlockedVaultSessionPayload(
      createPayload({ "device-id": 8 }),
    );

    await expect(
      ctx.database.encryptedUnlockedVaultSessionPayloads.count(),
    ).resolves.toBe(1);
    await expect(
      ctx.repository.getEncryptedUnlockedVaultSessionPayload(),
    ).resolves.toEqual(createPayload({ "device-id": 8 }));
  });

  it("returns null when there is no active encrypted payload", async () => {
    const ctx = createContext();

    await expect(
      ctx.repository.getEncryptedUnlockedVaultSessionPayload(),
    ).resolves.toBeNull();
  });

  it("removes the active encrypted payload", async () => {
    const ctx = createContext();

    await ctx.repository.saveEncryptedUnlockedVaultSessionPayload(
      createPayload({ "device-id": 7 }),
    );
    await ctx.repository.removeEncryptedUnlockedVaultSessionPayload();

    await expect(
      ctx.repository.getEncryptedUnlockedVaultSessionPayload(),
    ).resolves.toBeNull();
  });

  it.each([
    ["missing id", withoutField(storedPayload(), "id")],
    ["wrong id", { ...storedPayload(), id: "other" }],
    ["wrong id type", { ...storedPayload(), id: 7 }],
    ["extra field", { ...storedPayload(), futureField: true }],
    ["nonplain prototype", new HostileStoredPayloadRecord()],
  ] as const)("rejects an outer record with %s", async (_label, record) => {
    const ctx = createContext();
    vi.spyOn(
      ctx.database.encryptedUnlockedVaultSessionPayloads,
      "get",
    ).mockResolvedValueOnce(
      record as unknown as EncryptedUnlockedVaultSessionPayloadRecord,
    );

    await expectInvalidPayloadRecord(
      ctx.repository.getEncryptedUnlockedVaultSessionPayload(),
    );
  });

  it.each([
    ["missing session id", withoutField(storedPayload(), "sessionId")],
    ["blank session id", { ...storedPayload(), sessionId: "   " }],
    ["wrong session id", { ...storedPayload(), sessionId: 7 }],
    ["missing vault id", withoutField(storedPayload(), "vaultId")],
    ["blank vault id", { ...storedPayload(), vaultId: "" }],
    ["wrong vault id", { ...storedPayload(), vaultId: false }],
    [
      "missing version vector",
      withoutField(storedPayload(), "sourceSnapshotVersionVector"),
    ],
    [
      "wrong version vector",
      { ...storedPayload(), sourceSnapshotVersionVector: [] },
    ],
    [
      "blank version-vector identity",
      { ...storedPayload(), sourceSnapshotVersionVector: { " ": 1 } },
    ],
    [
      "negative version-vector counter",
      { ...storedPayload(), sourceSnapshotVersionVector: { device: -1 } },
    ],
    [
      "fractional version-vector counter",
      { ...storedPayload(), sourceSnapshotVersionVector: { device: 1.5 } },
    ],
    [
      "non-finite version-vector counter",
      {
        ...storedPayload(),
        sourceSnapshotVersionVector: { device: Number.POSITIVE_INFINITY },
      },
    ],
    ["missing content", withoutField(storedPayload(), "content")],
    ["wrong content", { ...storedPayload(), content: "encrypted" }],
    [
      "extra content field",
      {
        ...storedPayload(),
        content: { ...encryptedContent(), futureField: true },
      },
    ],
    [
      "missing ciphertext",
      {
        ...storedPayload(),
        content: withoutField(encryptedContent(), "ciphertext"),
      },
    ],
    [
      "wrong ciphertext type",
      { ...storedPayload(), content: { ...encryptedContent(), ciphertext: 7 } },
    ],
    [
      "noncanonical ciphertext",
      {
        ...storedPayload(),
        content: {
          ...encryptedContent(),
          ciphertext: `${canonicalBytes(32, 1)}=`,
        },
      },
    ],
    [
      "malformed ciphertext",
      {
        ...storedPayload(),
        content: { ...encryptedContent(), ciphertext: "***" },
      },
    ],
    [
      "short ciphertext",
      {
        ...storedPayload(),
        content: {
          ...encryptedContent(),
          ciphertext: canonicalBytes(16, 1),
        },
      },
    ],
    [
      "missing nonce",
      {
        ...storedPayload(),
        content: withoutField(encryptedContent(), "encryptionNonce"),
      },
    ],
    [
      "wrong nonce length",
      {
        ...storedPayload(),
        content: {
          ...encryptedContent(),
          encryptionNonce: canonicalBytes(11, 2),
        },
      },
    ],
    [
      "noncanonical nonce",
      {
        ...storedPayload(),
        content: {
          ...encryptedContent(),
          encryptionNonce: `${canonicalBytes(12, 2)}=`,
        },
      },
    ],
  ] as const)("rejects %s", async (_label, record) => {
    const ctx = createContext();
    vi.spyOn(
      ctx.database.encryptedUnlockedVaultSessionPayloads,
      "get",
    ).mockResolvedValueOnce(
      record as unknown as EncryptedUnlockedVaultSessionPayloadRecord,
    );

    await expectInvalidPayloadRecord(
      ctx.repository.getEncryptedUnlockedVaultSessionPayload(),
    );
  });

  it("rejects a hostile outer record before decrypting or installing a session", async () => {
    const ctx = createContext();
    const values = createCoreTestValues();
    const ports = createCoreTestPorts(values);
    const sourceSnapshotVersionVector = { [values.deviceId]: 7 };
    ports.saved.unlockedVaultSessionMaterial = {
      sessionId: values.sessionId,
      vaultId: values.vaultId,
      sourceSnapshotVersionVector,
      deviceId: values.deviceId,
      vaultMasterKey: values.vaultMasterKey,
      devicePrivateSignKey: values.devicePrivateSignKey,
      devicePrivateVaultKey: values.devicePrivateVaultKey,
      deviceLocalProtectionKey: values.deviceLocalProtectionKey,
      payloadKey: values.unlockedVaultSessionPayloadKey,
      trustedSnapshotContext: {
        snapshotDigest: values.vaultSnapshotDigest,
        trust: values.verifiedVaultTrustState,
      },
      vaultTrustAnchor: values.vaultTrustAnchor,
    };
    await ctx.database.encryptedUnlockedVaultSessionPayloads.put({
      ...storedPayload(),
      sessionId: values.sessionId,
      vaultId: values.vaultId,
      sourceSnapshotVersionVector,
      content: {
        ...encryptedContent(),
        ciphertext: `${canonicalBytes(32, 3)}=`,
      },
    } as unknown as EncryptedUnlockedVaultSessionPayloadRecord);
    const service = new UnlockedVaultSessionService(
      ports.unlockedVaultSessionMaterialRepository,
      ctx.repository,
      ports.crypto,
      ports.ids,
      ports.clipboardOperations,
    );

    await expectInvalidPayloadRecord(service.get());
    expect(
      ports.crypto.decryptUnlockedVaultSessionPayload,
    ).not.toHaveBeenCalled();
    expect(ports.ids.generateId).not.toHaveBeenCalled();
    expect(
      ports.unlockedVaultSessionMaterialRepository
        .saveUnlockedVaultSessionMaterial,
    ).not.toHaveBeenCalled();
    expect(ports.saved.unlockedVaultSessionMaterial).toBeUndefined();
    await expect(
      ctx.database.encryptedUnlockedVaultSessionPayloads.count(),
    ).resolves.toBe(0);
  });
});

function createPayload(
  sourceSnapshotVersionVector: VersionVector,
): EncryptedUnlockedVaultSessionPayload {
  const versionLabel = Object.entries(sourceSnapshotVersionVector)
    .map(([deviceId, version]) => `${deviceId}-${version}`)
    .join("-");

  return {
    sessionId: "session-id",
    vaultId: "vault-id",
    sourceSnapshotVersionVector,
    content: {
      ciphertext: canonicalBytes(32, versionLabel.length + 1),
      encryptionNonce: canonicalBytes(12, versionLabel.length + 2),
    },
  };
}

function storedPayload(): Record<string, unknown> {
  return {
    id: ACTIVE_UNLOCKED_VAULT_SESSION_PAYLOAD_ID,
    sessionId: "session-id",
    vaultId: "vault-id",
    sourceSnapshotVersionVector: { "device-id": 7 },
    content: encryptedContent(),
  };
}

function encryptedContent(): Record<string, unknown> {
  return {
    ciphertext: canonicalBytes(32, 1),
    encryptionNonce: canonicalBytes(12, 2),
  };
}

function canonicalBytes(
  length: number,
  seed: number,
): ReturnType<typeof encodeBase64Url> {
  return encodeBase64Url(
    Uint8Array.from({ length }, (_, index) => (seed + index) % 256),
  );
}

function withoutField(
  value: Record<string, unknown>,
  omittedKey: string,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== omittedKey),
  );
}

async function expectInvalidPayloadRecord(
  operation: Promise<unknown>,
): Promise<void> {
  let thrown: unknown;

  try {
    await operation;
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(InvalidUnlockedVaultSessionPayloadRecordError);
  expect(thrown).toMatchObject({
    name: "InvalidUnlockedVaultSessionPayloadRecordError",
    message: "Unlocked vault session payload record is malformed.",
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
