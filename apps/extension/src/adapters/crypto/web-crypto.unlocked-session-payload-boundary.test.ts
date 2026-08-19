import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  EncryptedUnlockedVaultSessionPayload,
  UnlockedVaultSessionPayloadKey,
  VersionVector,
} from "@lfspm/core";
import { UnlockedVaultSessionInvalidError } from "@lfspm/core";
import { encodeBase64Url } from "@lfspm/core/lib";
import { canonicalize } from "json-canonicalize";
import { createCoreTestPorts } from "../../../../../packages/core/src/__tests__/fixtures/ports";
import { createCoreTestValues } from "../../../../../packages/core/src/__tests__/fixtures/values";
import { UnlockedVaultSessionService } from "../../../../../packages/core/src/services/session/unlocked-vault-session.service";
import {
  createVaultManagerDb,
  type VaultManagerDb,
} from "../../infrastructure/database/dexie-db";
import { IndexedDbEncryptedUnlockedVaultSessionPayloadRepository } from "../storage/indexeddb-encrypted-unlocked-vault-session-payload.repository";
import {
  encodeUnlockedVaultSessionPayload,
  InvalidUnlockedVaultSessionPayloadError,
} from "../codecs/unlocked-session-payload.codec";
import { WebCryptoPort } from "./web-crypto.port";

const textEncoder = new TextEncoder();
const sessionContext = {
  sessionId: "session-id",
  vaultId: "vault-id",
  sourceSnapshotVersionVector: { "device-id": 7 },
};

let databaseCounter = 0;
let database: VaultManagerDb | undefined;

afterEach(async () => {
  await database?.delete();
  database = undefined;
});

describe("WebCrypto unlocked-session payload boundary", () => {
  it("round-trips a complete authenticated payload", async () => {
    const values = createCoreTestValues();
    const crypto = new WebCryptoPort();
    const key = await crypto.generateUnlockedVaultSessionPayloadKey();
    const payload = { vault: values.decryptedVault };

    const encrypted = await crypto.encryptUnlockedVaultSessionPayload(
      payload,
      key,
      sessionContext,
    );

    await expect(
      crypto.decryptUnlockedVaultSessionPayload(encrypted, key, sessionContext),
    ).resolves.toEqual(payload);
  });

  it.each([
    ["missing outer vault", "missing-outer"],
    ["wrong outer vault", "wrong-outer"],
    ["extra outer field", "extra-outer"],
    ["missing nested vault field", "missing-nested"],
    ["wrong nested collection", "wrong-nested"],
    ["extra nested vault field", "extra-nested"],
    ["invalid nested version vector", "invalid-vector"],
    ["unsupported nested sync provider", "unsupported-provider"],
    ["duplicate nested revoked identities", "duplicate-revoked"],
  ] as const)(
    "rejects authenticated plaintext with %s",
    async (_label, variant) => {
      const values = createCoreTestValues();
      const crypto = new WebCryptoPort();
      const key = await crypto.generateUnlockedVaultSessionPayloadKey();
      const encoded = record(
        structuredClone(
          encodeUnlockedVaultSessionPayload({ vault: values.decryptedVault }),
        ),
      );
      const hostile = mutatePayload(encoded, variant);
      const encrypted = await encryptAuthenticatedPlaintext(
        JSON.stringify(hostile),
        key,
        sessionContext,
      );

      await expectInvalidUnlockedVaultSessionPayload(
        crypto.decryptUnlockedVaultSessionPayload(
          encrypted,
          key,
          sessionContext,
        ),
      );
    },
  );

  it("rejects authenticated malformed JSON with the exact static error", async () => {
    const crypto = new WebCryptoPort();
    const key = await crypto.generateUnlockedVaultSessionPayloadKey();
    const encrypted = await encryptAuthenticatedPlaintext(
      '{"vault":{"entries":}}',
      key,
      sessionContext,
    );

    await expectInvalidUnlockedVaultSessionPayload(
      crypto.decryptUnlockedVaultSessionPayload(encrypted, key, sessionContext),
    );
  });

  it("maps authenticated decode failure to an invalid session with only a secret-free cause and installs no session", async () => {
    const values = createCoreTestValues();
    const ports = createCoreTestPorts(values);
    const crypto = new WebCryptoPort();
    const key = await crypto.generateUnlockedVaultSessionPayloadKey();
    const sourceSnapshotVersionVector = { [values.deviceId]: 7 };
    const context = {
      sessionId: values.sessionId,
      vaultId: values.vaultId,
      sourceSnapshotVersionVector,
    };
    const secretMarker = "plaintext-password-marker";
    const encoded = record(
      structuredClone(
        encodeUnlockedVaultSessionPayload({ vault: values.decryptedVault }),
      ),
    );
    encoded.futureField = secretMarker;
    const encryptedContent = await encryptAuthenticatedPlaintext(
      JSON.stringify(encoded),
      key,
      context,
    );
    databaseCounter += 1;
    database = createVaultManagerDb(`lfspm-session-payload-${databaseCounter}`);
    const encryptedPayloads =
      new IndexedDbEncryptedUnlockedVaultSessionPayloadRepository(database);
    await encryptedPayloads.saveEncryptedUnlockedVaultSessionPayload({
      ...context,
      content: encryptedContent,
    });
    ports.saved.unlockedVaultSessionMaterial = {
      ...context,
      deviceId: values.deviceId,
      vaultMasterKey: values.vaultMasterKey,
      devicePrivateSignKey: values.devicePrivateSignKey,
      devicePrivateVaultKey: values.devicePrivateVaultKey,
      deviceLocalProtectionKey: values.deviceLocalProtectionKey,
      payloadKey: key,
      trustedSnapshotContext: {
        snapshotDigest: values.vaultSnapshotDigest,
        trust: values.verifiedVaultTrustState,
      },
      vaultTrustAnchor: values.vaultTrustAnchor,
    };
    const service = new UnlockedVaultSessionService(
      ports.unlockedVaultSessionMaterialRepository,
      encryptedPayloads,
      crypto,
      ports.ids,
      ports.clipboardOperations,
    );
    const decrypt = vi.spyOn(crypto, "decryptUnlockedVaultSessionPayload");
    const savePayload = vi.spyOn(
      encryptedPayloads,
      "saveEncryptedUnlockedVaultSessionPayload",
    );
    let caught: unknown;

    try {
      await service.get();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(UnlockedVaultSessionInvalidError);
    expect(caught).toMatchObject({
      name: "UnlockedVaultSessionInvalidError",
      message:
        "Unlocked vault session is invalid: encrypted payload cannot be decrypted.",
    });
    const cause = (caught as Error).cause;
    expect(cause).toBeInstanceOf(InvalidUnlockedVaultSessionPayloadError);
    expect(cause).toMatchObject({
      name: "InvalidUnlockedVaultSessionPayloadError",
      message: "Unlocked vault session payload is malformed.",
    });
    expect(Object.hasOwn(record(cause), "cause")).toBe(false);
    expect(Object.hasOwn(record(cause), "input")).toBe(false);
    expect(String(caught)).not.toContain(secretMarker);
    expect(String(cause)).not.toContain(secretMarker);
    expect(decrypt).toHaveBeenCalledTimes(1);
    expect(savePayload).not.toHaveBeenCalled();
    expect(
      ports.unlockedVaultSessionMaterialRepository
        .saveUnlockedVaultSessionMaterial,
    ).not.toHaveBeenCalled();
    expect(ports.ids.generateId).not.toHaveBeenCalled();
    expect(ports.saved.unlockedVaultSession).toBeUndefined();
    expect(ports.saved.unlockedVaultSessionMaterial).toBeUndefined();
    await expect(
      encryptedPayloads.getEncryptedUnlockedVaultSessionPayload(),
    ).resolves.toBeNull();
  });
});

function mutatePayload(
  encoded: Record<string, unknown>,
  variant:
    | "missing-outer"
    | "wrong-outer"
    | "extra-outer"
    | "missing-nested"
    | "wrong-nested"
    | "extra-nested"
    | "invalid-vector"
    | "unsupported-provider"
    | "duplicate-revoked",
): unknown {
  if (variant === "missing-outer") {
    return withoutField(encoded, "vault");
  }
  if (variant === "wrong-outer") {
    encoded.vault = "vault";
    return encoded;
  }
  if (variant === "extra-outer") {
    encoded.futureField = true;
    return encoded;
  }

  const vault = record(encoded.vault);
  if (variant === "missing-nested") {
    encoded.vault = withoutField(vault, "entries");
  } else if (variant === "wrong-nested") {
    vault.entries = "entries";
  } else if (variant === "extra-nested") {
    vault.futureField = true;
  } else if (variant === "invalid-vector") {
    vault.versionVector = { "device-id": -1 };
  } else if (variant === "unsupported-provider") {
    vault.syncTarget = {
      provider: "future-provider",
      targetConfig: {},
    };
  } else {
    vault.providerCredentialRevocationPending = {
      revokedDeviceIds: ["revoked-device", "revoked-device"],
      vaultKeyGeneration: 1,
    };
  }

  return encoded;
}

async function encryptAuthenticatedPlaintext(
  plaintext: string,
  keyBytes: UnlockedVaultSessionPayloadKey,
  context: {
    readonly sessionId: string;
    readonly vaultId: string;
    readonly sourceSnapshotVersionVector: VersionVector;
  },
): Promise<EncryptedUnlockedVaultSessionPayload["content"]> {
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
      purpose: "lfspm-unlocked-vault-session-payload-v1",
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

async function expectInvalidUnlockedVaultSessionPayload(
  operation: Promise<unknown>,
): Promise<void> {
  let thrown: unknown;

  try {
    await operation;
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(InvalidUnlockedVaultSessionPayloadError);
  expect(thrown).toMatchObject({
    name: "InvalidUnlockedVaultSessionPayloadError",
    message: "Unlocked vault session payload is malformed.",
  });
  expect(Object.hasOwn(record(thrown), "cause")).toBe(false);
  expect(Object.hasOwn(record(thrown), "input")).toBe(false);
}

function withoutField(
  value: Record<string, unknown>,
  omittedKey: string,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== omittedKey),
  );
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Expected a record in the test fixture.");
  }

  return value as Record<string, unknown>;
}
