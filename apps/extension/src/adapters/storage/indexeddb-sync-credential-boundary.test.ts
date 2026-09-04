import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CompleteProviderCredentialRevocationUseCase,
  type EncryptedDeviceSyncCredentialState,
} from "@lfspm/core";
import { encodeBase64Url } from "@lfspm/core/lib";
import { createUnlockVaultTestContext } from "../../../../../packages/core/src/__tests__/fixtures/unlock-vault";
import { createUnlockedVaultWithEntries } from "../../../../../packages/core/src/__tests__/fixtures/vault-entries";
import { VaultSnapshotService } from "../../../../../packages/core/src/services/snapshot/vault-snapshot.service";
import { VaultSyncGuardService } from "../../../../../packages/core/src/services/sync/vault-sync-guard.service";
import {
  createVaultManagerDb,
  type PersistedVaultArtifactRecord,
  type VaultManagerDb,
} from "../../infrastructure/database/dexie-db";
import { IndexedDbVaultLocalRepositoryAdapter } from "./indexeddb-vault-local-repository.adapter";
import { InvalidSyncCredentialRecordError } from "../codecs/sync-credential.codec";

let databaseCounter = 0;
let database: VaultManagerDb | undefined;

afterEach(async () => {
  await database?.delete();
  database = undefined;
});

describe("IndexedDB sync credential boundary", () => {
  it("round-trips the exact encrypted state and treats an absent record as null", async () => {
    const { repository } = createContext();
    const state = encryptedState(1);

    await expect(
      repository.getDeviceSyncCredentialState("vault-id"),
    ).resolves.toBeNull();
    await repository.saveDeviceSyncCredentialState("vault-id", state);

    await expect(
      repository.getDeviceSyncCredentialState("vault-id"),
    ).resolves.toEqual(state);
  });

  it.each([
    ["missing wrapper field", { vaultId: "vault-id" }],
    [
      "wrong wrapper identity",
      { vaultId: "other-vault", artifact: encryptedArtifact(1) },
    ],
    [
      "extra wrapper field",
      { vaultId: "vault-id", artifact: encryptedArtifact(1), future: true },
    ],
  ] as const)(
    "rejects a %s with the exact static error",
    async (_label, row) => {
      const { database: currentDatabase, repository } = createContext();
      vi.spyOn(
        currentDatabase.deviceSyncCredentialStates,
        "get",
      ).mockResolvedValueOnce(row as unknown as PersistedVaultArtifactRecord);

      await expectInvalidSyncCredentialRecord(
        repository.getDeviceSyncCredentialState("vault-id"),
      );
    },
  );

  it.each([
    ["missing artifact field", { ciphertext: canonicalBytes(32, 1) }],
    [
      "wrong artifact field type",
      { ciphertext: 7, encryptionNonce: canonicalBytes(12, 2) },
    ],
    ["extra artifact field", { ...encryptedArtifact(1), future: true }],
    [
      "noncanonical ciphertext",
      {
        ...encryptedArtifact(1),
        ciphertext: `${canonicalBytes(32, 1)}=`,
      },
    ],
    ["malformed ciphertext", { ...encryptedArtifact(1), ciphertext: "***" }],
    [
      "short ciphertext",
      { ...encryptedArtifact(1), ciphertext: canonicalBytes(16, 1) },
    ],
    [
      "wrong nonce length",
      { ...encryptedArtifact(1), encryptionNonce: canonicalBytes(11, 2) },
    ],
    [
      "noncanonical nonce",
      {
        ...encryptedArtifact(1),
        encryptionNonce: `${canonicalBytes(12, 2)}=`,
      },
    ],
  ] as const)(
    "rejects %s with the exact static error",
    async (_label, artifact) => {
      const { database: currentDatabase, repository } = createContext();
      await currentDatabase.deviceSyncCredentialStates.put({
        vaultId: "vault-id",
        artifact,
      });

      await expectInvalidSyncCredentialRecord(
        repository.getDeviceSyncCredentialState("vault-id"),
      );
    },
  );

  it("blocks decrypt, provider access, writes, and session mutation when the outer record is hostile", async () => {
    const { database: currentDatabase, repository } = createContext();
    const ctx = createUnlockVaultTestContext();
    const unlockedVault = createUnlockedVaultWithEntries(ctx.values, []);
    ctx.saved.unlockedVaultSession = {
      sessionId: ctx.values.sessionId,
      unlockedVault: {
        ...unlockedVault,
        vault: {
          ...unlockedVault.vault,
          syncTarget: ctx.values.syncTarget,
          providerCredentialRevocationPending: {
            revokedDeviceIds: [ctx.values.pendingDeviceId],
            vaultKeyGeneration: 1,
          },
        },
      },
      sourceSnapshotVersionVector:
        ctx.vaultSnapshot.metadata.snapshotVersionVector,
    };
    await currentDatabase.deviceSyncCredentialStates.put({
      vaultId: ctx.values.vaultId,
      artifact: {
        ...encryptedArtifact(4),
        ciphertext: `${canonicalBytes(32, 4)}=`,
      },
    });
    const snapshot = new VaultSnapshotService(
      ctx.ports.crypto,
      ctx.ports.clock,
      repository,
    );
    const guard = new VaultSyncGuardService(
      ctx.ports.syncProvider,
      snapshot,
      ctx.ports.sessionServices.unlockedVaultSession,
      ctx.ports.crypto,
      repository,
    );
    const useCase = new CompleteProviderCredentialRevocationUseCase(
      ctx.ports.crypto,
      ctx.ports.syncProvider,
      ctx.ports.sessionServices.unlockedVaultSession,
      snapshot,
      repository,
      guard,
    );
    const saveCredential = vi.spyOn(
      repository,
      "saveDeviceSyncCredentialState",
    );
    const saveSnapshot = vi.spyOn(
      repository,
      "saveVaultSnapshotWithCheckpoint",
    );
    const commitSession = vi.spyOn(
      ctx.ports.sessionServices.unlockedVaultSession,
      "commitPersistedSnapshot",
    );

    await expectInvalidSyncCredentialRecord(
      useCase.execute({ vaultId: ctx.values.vaultId }),
    );
    expect(
      ctx.ports.crypto.decryptDeviceSyncCredentialState,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.checkVaultAccess).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
    expect(saveCredential).not.toHaveBeenCalled();
    expect(saveSnapshot).not.toHaveBeenCalled();
    expect(commitSession).not.toHaveBeenCalled();
    await expect(
      currentDatabase.deviceSyncCredentialStates.count(),
    ).resolves.toBe(1);
  });
});

function createContext(): {
  readonly database: VaultManagerDb;
  readonly repository: IndexedDbVaultLocalRepositoryAdapter;
} {
  databaseCounter += 1;
  database = createVaultManagerDb(`lfspm-sync-credential-${databaseCounter}`);
  return {
    database,
    repository: new IndexedDbVaultLocalRepositoryAdapter(database),
  };
}

function encryptedState(seed: number): EncryptedDeviceSyncCredentialState {
  return encryptedArtifact(seed) as EncryptedDeviceSyncCredentialState;
}

function encryptedArtifact(seed: number): {
  readonly ciphertext: string;
  readonly encryptionNonce: string;
} {
  return {
    ciphertext: canonicalBytes(32, seed),
    encryptionNonce: canonicalBytes(12, seed + 1),
  };
}

function canonicalBytes(length: number, seed: number): string {
  return encodeBase64Url(
    Uint8Array.from({ length }, (_, index) => (seed + index) % 256),
  );
}

async function expectInvalidSyncCredentialRecord(
  operation: Promise<unknown>,
): Promise<void> {
  let thrown: unknown;

  try {
    await operation;
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(InvalidSyncCredentialRecordError);
  expect(thrown).toMatchObject({
    name: "InvalidSyncCredentialRecordError",
    message: "Sync credential record is malformed.",
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
