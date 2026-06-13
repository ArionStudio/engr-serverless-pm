import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import type { EncryptedUnlockedVaultSessionPayload } from "@lfspm/core";
import type { Base64URLString } from "@lfspm/core/lib";
import {
  ACTIVE_UNLOCKED_VAULT_SESSION_PAYLOAD_ID,
  createVaultManagerDb,
  type VaultManagerDb,
} from "../../infrastructure/database/dexie-db";
import { IndexedDbEncryptedUnlockedVaultSessionPayloadRepository } from "./indexeddb-encrypted-unlocked-vault-session-payload.repository";

let databaseCounter = 0;
let database: VaultManagerDb | undefined;

const b64 = (value: string) => value as Base64URLString;

function createContext() {
  databaseCounter += 1;
  database = createVaultManagerDb(`lfspm-extension-test-${databaseCounter}`);

  return {
    database,
    repository: new IndexedDbEncryptedUnlockedVaultSessionPayloadRepository(
      database,
    ),
  };
}

afterEach(async () => {
  await database?.delete();
  database = undefined;
});

describe("IndexedDbEncryptedUnlockedVaultSessionPayloadRepository", () => {
  it("saves one active encrypted payload record", async () => {
    const ctx = createContext();
    const payload = createPayload(7);

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
      createPayload(7),
    );
    await ctx.repository.saveEncryptedUnlockedVaultSessionPayload(
      createPayload(8),
    );

    await expect(
      ctx.database.encryptedUnlockedVaultSessionPayloads.count(),
    ).resolves.toBe(1);
    await expect(
      ctx.repository.getEncryptedUnlockedVaultSessionPayload(),
    ).resolves.toEqual(createPayload(8));
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
      createPayload(7),
    );
    await ctx.repository.removeEncryptedUnlockedVaultSessionPayload();

    await expect(
      ctx.repository.getEncryptedUnlockedVaultSessionPayload(),
    ).resolves.toBeNull();
  });
});

function createPayload(
  sourceSnapshotRevision: number,
): EncryptedUnlockedVaultSessionPayload {
  return {
    sessionId: "session-id",
    vaultId: "vault-id",
    sourceSnapshotRevision,
    content: {
      ciphertext: b64(`ciphertext-${sourceSnapshotRevision}`),
      encryptionNonce: b64(`nonce-${sourceSnapshotRevision}`),
    },
  };
}
