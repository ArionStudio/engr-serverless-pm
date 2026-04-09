import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { DexieStorageAdapter } from "./dexie-storage.adapter";
import type {
  EncryptedVaultRecord,
  LocalDeviceState,
  PendingSyncItem,
} from "@/core/storage/storage.type";
import { STORE_NAMES } from "@/core/storage/storage.const";
import { db } from "@/infrastructure/database/dexie-db";

// ── Fixtures ─────────────────────────────────────────────

function makeVault(
  overrides?: Partial<EncryptedVaultRecord>,
): EncryptedVaultRecord {
  return {
    vaultId: "vault-001",
    profileId: "profile-v1",
    data: new Uint8Array([1, 2, 3, 4, 5]),
    lastModified: Date.now(),
    lastSyncTimestamp: null,
    ...overrides,
  };
}

function makeDeviceState(
  overrides?: Partial<LocalDeviceState>,
): LocalDeviceState {
  return {
    deviceId: "device-001",
    deviceName: "Test Device",
    salt: new Uint8Array(32).fill(0xab),
    wrappedDeviceKeys: {
      wrappedSigningPrivateKey: new ArrayBuffer(48),
      wrappedAgreementPrivateKey: new ArrayBuffer(48),
      signingPublicKeyBytes: new ArrayBuffer(32),
      agreementPublicKeyBytes: new ArrayBuffer(65),
    },
    vaultId: "vault-001",
    lastSyncTimestamp: null,
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeSyncItem(overrides?: Partial<PendingSyncItem>): PendingSyncItem {
  return {
    id: "sync-001",
    operation: "create",
    entryId: "entry-001",
    timestamp: Date.now(),
    retryCount: 0,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────

describe("DexieStorageAdapter", () => {
  beforeEach(async () => {
    await DexieStorageAdapter.deleteAll();
  });

  // ── Vault Operations ─────────────────────────────────

  describe("vault operations", () => {
    it("saves and loads a vault record", async () => {
      const vault = makeVault();
      await DexieStorageAdapter.saveVault(vault, "default_vault");
      const loaded = await DexieStorageAdapter.loadVault("default_vault");

      expect(loaded).not.toBeNull();
      expect(loaded!.vaultId).toBe("default_vault");
      expect(loaded!.profileId).toBe(vault.profileId);
      expect(loaded!.lastModified).toBe(vault.lastModified);
    });

    it("returns null when no vault exists", async () => {
      const loaded = await DexieStorageAdapter.loadVault("default_vault");
      expect(loaded).toBeNull();
    });

    it("overwrites vault on repeated save with same vaultId", async () => {
      const vault1 = makeVault({ lastModified: 1000 });
      const vault2 = makeVault({ lastModified: 2000 });

      await DexieStorageAdapter.saveVault(vault1, "default_vault");
      await DexieStorageAdapter.saveVault(vault2, "default_vault");

      const loaded = await DexieStorageAdapter.loadVault("default_vault");
      expect(loaded!.lastModified).toBe(2000);
    });

    it("clearVault removes the vault", async () => {
      await DexieStorageAdapter.saveVault(makeVault(), "default_vault");
      await DexieStorageAdapter.clearVault();

      const loaded = await DexieStorageAdapter.loadVault("default_vault");
      expect(loaded).toBeNull();
    });

    it("preserves Uint8Array data through round-trip", async () => {
      const data = new Uint8Array([10, 20, 30, 40, 50]);
      await DexieStorageAdapter.saveVault(makeVault({ data }), "default_vault");

      const loaded = await DexieStorageAdapter.loadVault("default_vault");
      expect(new Uint8Array(loaded!.data)).toEqual(data);
    });

    it("loads vault deterministically from singleton key when multiple rows exist", async () => {
      await db[STORE_NAMES.VAULT].put(makeVault({ vaultId: "legacy-vault" }));
      await DexieStorageAdapter.saveVault(
        makeVault({ vaultId: "ignored-id" }),
        "default_vault",
      );

      const loaded = await DexieStorageAdapter.loadVault("default_vault");
      expect(loaded).not.toBeNull();
      expect(loaded!.vaultId).toBe("default_vault");
      expect(loaded!.profileId).toBe("profile-v1");
    });
  });

  // ── Device State Operations ──────────────────────────

  describe("device state operations", () => {
    it("saves and loads device state", async () => {
      const state = makeDeviceState();
      await DexieStorageAdapter.saveDeviceState(state, "default_device");
      const loaded =
        await DexieStorageAdapter.loadDeviceState("default_device");

      expect(loaded).not.toBeNull();
      expect(loaded!.deviceId).toBe("default_device");
      expect(loaded!.deviceName).toBe(state.deviceName);
    });

    it("returns null when no device state exists", async () => {
      const loaded =
        await DexieStorageAdapter.loadDeviceState("default_device");
      expect(loaded).toBeNull();
    });

    it("overwrites device state on repeated save", async () => {
      const state1 = makeDeviceState({ deviceName: "Old Name" });
      const state2 = makeDeviceState({ deviceName: "New Name" });

      await DexieStorageAdapter.saveDeviceState(state1, "default_device");
      await DexieStorageAdapter.saveDeviceState(state2, "default_device");

      const loaded =
        await DexieStorageAdapter.loadDeviceState("default_device");
      expect(loaded!.deviceName).toBe("New Name");
    });

    it("clearDeviceState removes the state", async () => {
      await DexieStorageAdapter.saveDeviceState(
        makeDeviceState(),
        "default_device",
      );
      await DexieStorageAdapter.clearDeviceState();

      const loaded =
        await DexieStorageAdapter.loadDeviceState("default_device");
      expect(loaded).toBeNull();
    });

    it("preserves Uint8Array salt through round-trip", async () => {
      const salt = new Uint8Array(32).fill(0xcd);
      await DexieStorageAdapter.saveDeviceState(
        makeDeviceState({ salt }),
        "default_device",
      );

      const loaded =
        await DexieStorageAdapter.loadDeviceState("default_device");
      expect(new Uint8Array(loaded!.salt)).toEqual(salt);
    });

    it("preserves ArrayBuffer wrapped keys through round-trip", async () => {
      const state = makeDeviceState();
      await DexieStorageAdapter.saveDeviceState(state, "default_device");

      const loaded =
        await DexieStorageAdapter.loadDeviceState("default_device");
      expect(
        loaded!.wrappedDeviceKeys.wrappedSigningPrivateKey.byteLength,
      ).toBe(state.wrappedDeviceKeys.wrappedSigningPrivateKey.byteLength);
      expect(
        loaded!.wrappedDeviceKeys.wrappedAgreementPrivateKey.byteLength,
      ).toBe(state.wrappedDeviceKeys.wrappedAgreementPrivateKey.byteLength);
    });

    it("loads device state deterministically from singleton key when multiple rows exist", async () => {
      await db[STORE_NAMES.DEVICE_STATE].put(
        makeDeviceState({ deviceId: "legacy-device" }),
      );
      await DexieStorageAdapter.saveDeviceState(
        makeDeviceState({ deviceId: "ignored-id" }),
        "default_device",
      );

      const loaded =
        await DexieStorageAdapter.loadDeviceState("default_device");
      expect(loaded).not.toBeNull();
      expect(loaded!.deviceId).toBe("default_device");
    });
  });

  // ── Pending Sync Operations ──────────────────────────

  describe("pending sync operations", () => {
    it("adds and retrieves sync items", async () => {
      const item = makeSyncItem();
      await DexieStorageAdapter.addPendingSync(item);

      const items = await DexieStorageAdapter.getPendingSyncItems();
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe(item.id);
    });

    it("returns items ordered by timestamp", async () => {
      await DexieStorageAdapter.addPendingSync(
        makeSyncItem({ id: "sync-c", timestamp: 3000 }),
      );
      await DexieStorageAdapter.addPendingSync(
        makeSyncItem({ id: "sync-a", timestamp: 1000 }),
      );
      await DexieStorageAdapter.addPendingSync(
        makeSyncItem({ id: "sync-b", timestamp: 2000 }),
      );

      const items = await DexieStorageAdapter.getPendingSyncItems();
      expect(items.map((i) => i.id)).toEqual(["sync-a", "sync-b", "sync-c"]);
    });

    it("removes specific item by id", async () => {
      await DexieStorageAdapter.addPendingSync(makeSyncItem({ id: "keep" }));
      await DexieStorageAdapter.addPendingSync(
        makeSyncItem({ id: "remove", timestamp: Date.now() + 1 }),
      );

      await DexieStorageAdapter.removePendingSync("remove");

      const items = await DexieStorageAdapter.getPendingSyncItems();
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe("keep");
    });

    it("clearPendingSync removes all items", async () => {
      await DexieStorageAdapter.addPendingSync(makeSyncItem({ id: "s1" }));
      await DexieStorageAdapter.addPendingSync(
        makeSyncItem({ id: "s2", timestamp: Date.now() + 1 }),
      );

      await DexieStorageAdapter.clearPendingSync();

      const items = await DexieStorageAdapter.getPendingSyncItems();
      expect(items).toHaveLength(0);
    });

    it("returns empty array when no items exist", async () => {
      const items = await DexieStorageAdapter.getPendingSyncItems();
      expect(items).toEqual([]);
    });
  });

  // ── Database Management ──────────────────────────────

  describe("database management", () => {
    it("isReady returns true when DB is accessible", async () => {
      const ready = await DexieStorageAdapter.isReady();
      expect(ready).toBe(true);
    });

    it("deleteAll clears all stores", async () => {
      await DexieStorageAdapter.saveVault(makeVault(), "default_vault");
      await DexieStorageAdapter.saveDeviceState(
        makeDeviceState(),
        "default_device",
      );
      await DexieStorageAdapter.addPendingSync(makeSyncItem());

      await DexieStorageAdapter.deleteAll();

      expect(await DexieStorageAdapter.loadVault("default_vault")).toBeNull();
      expect(
        await DexieStorageAdapter.loadDeviceState("default_device"),
      ).toBeNull();
      expect(await DexieStorageAdapter.getPendingSyncItems()).toEqual([]);
    });
  });
});
