import Dexie from "dexie";
import type { EntityTable } from "dexie";

const STORE_NAMES = {
  VAULT: "",
  DEVICE_STATE: "",
  PENDING_SYNC: "",
};

const DATABASE_NAME = "";
const STORAGE_SCHEMA_VERSION = 1;

type EncryptedVaultRecord = {
  vaultId: "";
};
type LocalDeviceState = { deviceId: "" };
type PendingSyncItem = { id: "" };

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
