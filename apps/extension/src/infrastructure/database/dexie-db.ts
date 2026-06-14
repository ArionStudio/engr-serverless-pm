import Dexie from "dexie";
import type { EntityTable } from "dexie";
import type { SerializedEncrypted, Vault } from "@lfspm/core";

export const DATABASE_NAME = "lfspm-extension";
export const STORAGE_SCHEMA_VERSION = 1;

export const STORE_NAMES = {
  ENCRYPTED_UNLOCKED_VAULT_SESSION_PAYLOADS:
    "encryptedUnlockedVaultSessionPayloads",
} as const;

export const ACTIVE_UNLOCKED_VAULT_SESSION_PAYLOAD_ID = "active";

export type EncryptedUnlockedVaultSessionPayloadRecord = {
  id: typeof ACTIVE_UNLOCKED_VAULT_SESSION_PAYLOAD_ID;
  sessionId: string;
  vaultId: string;
  sourceSnapshotRevision: number;
  content: SerializedEncrypted<{
    readonly vault: Vault;
  }>;
};

export type VaultManagerDb = Dexie & {
  encryptedUnlockedVaultSessionPayloads: EntityTable<
    EncryptedUnlockedVaultSessionPayloadRecord,
    "id"
  >;
};

export function createVaultManagerDb(
  databaseName = DATABASE_NAME,
): VaultManagerDb {
  const db = new Dexie(databaseName) as VaultManagerDb;

  db.version(STORAGE_SCHEMA_VERSION).stores({
    [STORE_NAMES.ENCRYPTED_UNLOCKED_VAULT_SESSION_PAYLOADS]: "id",
  });

  return db;
}

export const db = createVaultManagerDb();
