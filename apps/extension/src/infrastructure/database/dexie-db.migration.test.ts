import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import type {
  EncryptedVaultRecord,
  LocalDeviceState,
  PendingSyncItem,
} from "@/core/storage/storage.type";
import { STORE_NAMES } from "@/core/storage/storage.const";

// ── V1 Schema (current) ────────────────────────────────

const V1_STORES = {
  [STORE_NAMES.VAULT]: "vaultId",
  [STORE_NAMES.DEVICE_STATE]: "deviceId",
  [STORE_NAMES.PENDING_SYNC]: "id, timestamp",
} as const;

// ── V2 Schema (adds settings store) ────────────────────

const V2_STORES = {
  [STORE_NAMES.SETTINGS]: "key",
} as const;

// ── Fixtures ────────────────────────────────────────────

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

// ── Helpers ─────────────────────────────────────────────

let dbCounter = 0;

function uniqueDbName(): string {
  return `spm-migration-test-${Date.now()}-${dbCounter++}`;
}

function openV1(name: string): Dexie {
  const d = new Dexie(name);
  d.version(1).stores(V1_STORES);
  return d;
}

function openV1V2(name: string): Dexie {
  const d = new Dexie(name);
  d.version(1).stores(V1_STORES);
  d.version(2).stores(V2_STORES);
  return d;
}

// ── Cleanup ─────────────────────────────────────────────

const openedDbs: string[] = [];

afterEach(async () => {
  for (const name of openedDbs) {
    await Dexie.delete(name);
  }
  openedDbs.length = 0;
});

function trackDb(name: string): void {
  openedDbs.push(name);
}

// ── Tests ───────────────────────────────────────────────

describe("Dexie schema migrations", () => {
  describe("v1 schema", () => {
    it("creates expected stores and accepts writes", async () => {
      const name = uniqueDbName();
      trackDb(name);
      const d = openV1(name);

      await d.open();

      // Verify all v1 tables exist
      const tableNames = d.tables.map((t) => t.name).sort();
      expect(tableNames).toEqual(
        [
          STORE_NAMES.VAULT,
          STORE_NAMES.DEVICE_STATE,
          STORE_NAMES.PENDING_SYNC,
        ].sort(),
      );

      // Verify each table is writable
      await d.table(STORE_NAMES.VAULT).put(makeVault());
      await d.table(STORE_NAMES.DEVICE_STATE).put(makeDeviceState());
      await d.table(STORE_NAMES.PENDING_SYNC).add(makeSyncItem());

      expect(await d.table(STORE_NAMES.VAULT).count()).toBe(1);
      expect(await d.table(STORE_NAMES.DEVICE_STATE).count()).toBe(1);
      expect(await d.table(STORE_NAMES.PENDING_SYNC).count()).toBe(1);

      d.close();
    });
  });

  describe("v1 → v2 migration", () => {
    it("preserves existing data across upgrade", async () => {
      const name = uniqueDbName();
      trackDb(name);

      // ── Populate v1 ──
      const v1 = openV1(name);
      const vault = makeVault();
      const deviceState = makeDeviceState();
      const syncItem = makeSyncItem();

      await v1.table(STORE_NAMES.VAULT).put(vault);
      await v1.table(STORE_NAMES.DEVICE_STATE).put(deviceState);
      await v1.table(STORE_NAMES.PENDING_SYNC).add(syncItem);
      v1.close();

      // ── Reopen with v2 ──
      const v2 = openV1V2(name);
      await v2.open();

      // Verify v1 data survived
      const loadedVault = await v2.table(STORE_NAMES.VAULT).get("vault-001");
      expect(loadedVault).not.toBeUndefined();
      expect(loadedVault.vaultId).toBe(vault.vaultId);
      expect(loadedVault.profileId).toBe(vault.profileId);
      expect(loadedVault.lastModified).toBe(vault.lastModified);

      const loadedState = await v2
        .table(STORE_NAMES.DEVICE_STATE)
        .get("device-001");
      expect(loadedState).not.toBeUndefined();
      expect(loadedState.deviceId).toBe(deviceState.deviceId);
      expect(loadedState.deviceName).toBe(deviceState.deviceName);
      expect(loadedState.vaultId).toBe(deviceState.vaultId);

      const loadedSync = await v2
        .table(STORE_NAMES.PENDING_SYNC)
        .get("sync-001");
      expect(loadedSync).not.toBeUndefined();
      expect(loadedSync.operation).toBe(syncItem.operation);
      expect(loadedSync.entryId).toBe(syncItem.entryId);

      // Verify new v2 store exists and is functional
      const tableNames = v2.tables.map((t) => t.name);
      expect(tableNames).toContain(STORE_NAMES.SETTINGS);
      await v2.table(STORE_NAMES.SETTINGS).put({ key: "theme", value: "dark" });
      const setting = await v2.table(STORE_NAMES.SETTINGS).get("theme");
      expect(setting.value).toBe("dark");

      v2.close();
    });

    it("preserves binary data (Uint8Array / ArrayBuffer) through upgrade", async () => {
      const name = uniqueDbName();
      trackDb(name);

      const vaultData = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0xca, 0xfe]);
      const salt = new Uint8Array(32).fill(0xcd);
      const wrappedSigning = new Uint8Array(48).fill(0x11).buffer;
      const wrappedAgreement = new Uint8Array(48).fill(0x22).buffer;
      const signingPub = new Uint8Array(32).fill(0x33).buffer;
      const agreementPub = new Uint8Array(65).fill(0x44).buffer;

      // ── Populate v1 ──
      const v1 = openV1(name);
      await v1.table(STORE_NAMES.VAULT).put(makeVault({ data: vaultData }));
      await v1.table(STORE_NAMES.DEVICE_STATE).put(
        makeDeviceState({
          salt,
          wrappedDeviceKeys: {
            wrappedSigningPrivateKey: wrappedSigning,
            wrappedAgreementPrivateKey: wrappedAgreement,
            signingPublicKeyBytes: signingPub,
            agreementPublicKeyBytes: agreementPub,
          },
        }),
      );
      v1.close();

      // ── Reopen with v2 ──
      const v2 = openV1V2(name);
      await v2.open();

      // Verify vault binary data
      const loadedVault = await v2.table(STORE_NAMES.VAULT).get("vault-001");
      expect(new Uint8Array(loadedVault.data)).toEqual(vaultData);

      // Verify device state salt
      const loadedState = await v2
        .table(STORE_NAMES.DEVICE_STATE)
        .get("device-001");
      expect(new Uint8Array(loadedState.salt)).toEqual(salt);

      // Verify wrapped device keys
      const keys = loadedState.wrappedDeviceKeys;
      expect(new Uint8Array(keys.wrappedSigningPrivateKey)).toEqual(
        new Uint8Array(wrappedSigning),
      );
      expect(new Uint8Array(keys.wrappedAgreementPrivateKey)).toEqual(
        new Uint8Array(wrappedAgreement),
      );
      expect(new Uint8Array(keys.signingPublicKeyBytes)).toEqual(
        new Uint8Array(signingPub),
      );
      expect(new Uint8Array(keys.agreementPublicKeyBytes)).toEqual(
        new Uint8Array(agreementPub),
      );

      v2.close();
    });

    it("handles empty database migration gracefully", async () => {
      const name = uniqueDbName();
      trackDb(name);

      // ── Open empty v1, then close ──
      const v1 = openV1(name);
      await v1.open();
      expect(await v1.table(STORE_NAMES.VAULT).count()).toBe(0);
      v1.close();

      // ── Reopen with v2 ──
      const v2 = openV1V2(name);
      await v2.open();

      // No errors, all stores accessible
      expect(await v2.table(STORE_NAMES.VAULT).count()).toBe(0);
      expect(await v2.table(STORE_NAMES.DEVICE_STATE).count()).toBe(0);
      expect(await v2.table(STORE_NAMES.PENDING_SYNC).count()).toBe(0);
      expect(await v2.table(STORE_NAMES.SETTINGS).count()).toBe(0);

      // New store is writable
      await v2.table(STORE_NAMES.SETTINGS).put({ key: "lang", value: "en" });
      expect(await v2.table(STORE_NAMES.SETTINGS).count()).toBe(1);

      v2.close();
    });
  });
});
