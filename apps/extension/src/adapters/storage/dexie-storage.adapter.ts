import type { StoragePort } from "@/core/storage/storage.port";
import type {
  EncryptedVaultRecord,
  LocalDeviceState,
  PendingSyncItem,
} from "@/core/storage/storage.type";
import { STORE_NAMES } from "@/core/storage/storage.const";
import { db } from "@/infrastructure/database/dexie-db";

export const DexieStorageAdapter: StoragePort = {
  // ── Vault (singleton) ──────────────────────────────────

  async saveVault(vault: EncryptedVaultRecord): Promise<void> {
    await db[STORE_NAMES.VAULT].put(vault);
  },

  async loadVault(): Promise<EncryptedVaultRecord | null> {
    return (await db[STORE_NAMES.VAULT].toCollection().first()) ?? null;
  },

  async clearVault(): Promise<void> {
    await db[STORE_NAMES.VAULT].clear();
  },

  // ── Device State (singleton) ───────────────────────────

  async saveDeviceState(state: LocalDeviceState): Promise<void> {
    await db[STORE_NAMES.DEVICE_STATE].put(state);
  },

  async loadDeviceState(): Promise<LocalDeviceState | null> {
    return (await db[STORE_NAMES.DEVICE_STATE].toCollection().first()) ?? null;
  },

  async clearDeviceState(): Promise<void> {
    await db[STORE_NAMES.DEVICE_STATE].clear();
  },

  // ── Pending Sync Queue ─────────────────────────────────

  async addPendingSync(item: PendingSyncItem): Promise<void> {
    await db[STORE_NAMES.PENDING_SYNC].add(item);
  },

  async getPendingSyncItems(): Promise<PendingSyncItem[]> {
    return db[STORE_NAMES.PENDING_SYNC].orderBy("timestamp").toArray();
  },

  async removePendingSync(itemId: string): Promise<void> {
    await db[STORE_NAMES.PENDING_SYNC].delete(itemId);
  },

  async clearPendingSync(): Promise<void> {
    await db[STORE_NAMES.PENDING_SYNC].clear();
  },

  // ── Database Management ────────────────────────────────

  async isReady(): Promise<boolean> {
    try {
      if (!db.isOpen()) {
        await db.open();
      }
      return true;
    } catch {
      return false;
    }
  },

  async deleteAll(): Promise<void> {
    await db.transaction(
      "rw",
      db[STORE_NAMES.VAULT],
      db[STORE_NAMES.DEVICE_STATE],
      db[STORE_NAMES.PENDING_SYNC],
      async () => {
        await db[STORE_NAMES.VAULT].clear();
        await db[STORE_NAMES.DEVICE_STATE].clear();
        await db[STORE_NAMES.PENDING_SYNC].clear();
      },
    );
  },
};
