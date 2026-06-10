import { describe, expect, it } from "vitest";
import type {
  DevicePrivateSignKey,
  UnlockedVaultSessionMaterial,
  UnlockedVaultSessionPayloadKey,
  VaultMasterKey,
} from "@lfspm/core/domain";
import {
  ChromeUnlockedVaultSessionMaterialRepository,
  type ChromeStorageArea,
  UNLOCKED_VAULT_SESSION_MATERIAL_STORAGE_KEY,
} from "./chrome-unlocked-vault-session-material.repository";

function createStorageArea(initialRecords: Record<string, unknown> = {}) {
  const records = { ...initialRecords };
  const storageArea: ChromeStorageArea = {
    async get(keys?: unknown) {
      if (typeof keys === "string") {
        return { [keys]: records[keys] };
      }

      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.map((key) => [key, records[key]]));
      }

      return { ...records };
    },
    async set(items: Record<string, unknown>) {
      Object.assign(records, items);
    },
    async remove(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        delete records[key];
      }
    },
  };

  return {
    records,
    storageArea,
  };
}

function createMaterial(): UnlockedVaultSessionMaterial {
  return {
    sessionId: "session-id",
    vaultId: "vault-id",
    sourceSnapshotRevision: 7,
    deviceId: "device-id",
    vaultMasterKey: arrayBuffer(1, 2, 3) as VaultMasterKey,
    devicePrivateSignKey: arrayBuffer(4, 5, 6) as DevicePrivateSignKey,
    payloadKey: arrayBuffer(7, 8, 9) as UnlockedVaultSessionPayloadKey,
  };
}

describe("ChromeUnlockedVaultSessionMaterialRepository", () => {
  it("saves session material as storage-safe strings", async () => {
    const { records, storageArea } = createStorageArea();
    const repository = new ChromeUnlockedVaultSessionMaterialRepository(
      storageArea,
    );

    await repository.saveUnlockedVaultSessionMaterial(createMaterial());

    expect(records[UNLOCKED_VAULT_SESSION_MATERIAL_STORAGE_KEY]).toEqual({
      sessionId: "session-id",
      vaultId: "vault-id",
      sourceSnapshotRevision: 7,
      deviceId: "device-id",
      vaultMasterKey: "AQID",
      devicePrivateSignKey: "BAUG",
      payloadKey: "BwgJ",
    });
  });

  it("restores session material from storage", async () => {
    const { storageArea } = createStorageArea({
      [UNLOCKED_VAULT_SESSION_MATERIAL_STORAGE_KEY]: {
        sessionId: "session-id",
        vaultId: "vault-id",
        sourceSnapshotRevision: 7,
        deviceId: "device-id",
        vaultMasterKey: "AQID",
        devicePrivateSignKey: "BAUG",
        payloadKey: "BwgJ",
      },
    });
    const repository = new ChromeUnlockedVaultSessionMaterialRepository(
      storageArea,
    );

    const result = await repository.getUnlockedVaultSessionMaterial();

    expect(result).toEqual(createMaterial());
  });

  it("returns null when session material is missing", async () => {
    const { storageArea } = createStorageArea();
    const repository = new ChromeUnlockedVaultSessionMaterialRepository(
      storageArea,
    );

    await expect(
      repository.getUnlockedVaultSessionMaterial(),
    ).resolves.toBeNull();
  });

  it("names the malformed field when stored material is corrupted", async () => {
    const { storageArea } = createStorageArea({
      [UNLOCKED_VAULT_SESSION_MATERIAL_STORAGE_KEY]: {
        sessionId: "session-id",
        vaultId: "vault-id",
        sourceSnapshotRevision: 7,
        deviceId: "device-id",
        vaultMasterKey: "AQID",
        devicePrivateSignKey: "BAUG",
        payloadKey: null,
      },
    });
    const repository = new ChromeUnlockedVaultSessionMaterialRepository(
      storageArea,
    );

    await expect(repository.getUnlockedVaultSessionMaterial()).rejects.toThrow(
      'Unlocked vault session material field "payloadKey" is malformed.',
    );
  });

  it("removes session material", async () => {
    const { records, storageArea } = createStorageArea({
      [UNLOCKED_VAULT_SESSION_MATERIAL_STORAGE_KEY]: {
        sessionId: "session-id",
      },
    });
    const repository = new ChromeUnlockedVaultSessionMaterialRepository(
      storageArea,
    );

    await repository.removeUnlockedVaultSessionMaterial();

    expect(records).not.toHaveProperty(
      UNLOCKED_VAULT_SESSION_MATERIAL_STORAGE_KEY,
    );
  });
});

function arrayBuffer(...bytes: number[]): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}
