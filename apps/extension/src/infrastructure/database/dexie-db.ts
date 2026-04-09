import Dexie from "dexie";
import type { EntityTable } from "dexie";
import type {
  EncryptedVaultRecord,
  LocalDeviceState,
  PendingSyncItem,
} from "@/core/storage/storage.type";
import {
  DATABASE_NAME,
  STORAGE_SCHEMA_VERSION,
  STORE_NAMES,
} from "@/core/storage/storage.const";

type VaultManagerDb = Dexie & {
  [STORE_NAMES.VAULT]: EntityTable<EncryptedVaultRecord, "vaultId">;
  [STORE_NAMES.DEVICE_STATE]: EntityTable<LocalDeviceState, "deviceId">;
  [STORE_NAMES.PENDING_SYNC]: EntityTable<PendingSyncItem, "id">;
};

const db = new Dexie(DATABASE_NAME) as VaultManagerDb;

db.version(STORAGE_SCHEMA_VERSION).stores({
  [STORE_NAMES.VAULT]: "vaultId",
  [STORE_NAMES.DEVICE_STATE]: "deviceId",
  [STORE_NAMES.PENDING_SYNC]: "id, timestamp",
});

export { db };
export type { VaultManagerDb };
