import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DeviceLocalProtectionKey,
  DevicePrivateSignKey,
  DevicePublicSignKey,
  DeviceVaultPrivateKey,
  DeviceVaultPublicKey,
  UnlockedVaultSessionPayloadKey,
  VaultMasterKey,
} from "@lfspm/core";
import {
  ChromeUnlockedVaultSessionMaterialRepository,
  type ChromeStorageArea,
  UNLOCKED_VAULT_SESSION_MATERIAL_STORAGE_KEY,
} from "./chrome-unlocked-vault-session-material.repository";

const { bestEffortWipeArrayBuffersSpy, secureWipeSpy } = vi.hoisted(() => ({
  bestEffortWipeArrayBuffersSpy: vi.fn(
    (buffers: readonly (ArrayBuffer | undefined)[]) => {
      for (const buffer of buffers) {
        if (buffer !== undefined) {
          new Uint8Array(buffer).fill(0);
        }
      }
    },
  ),
  secureWipeSpy: vi.fn((bytes: Uint8Array) => bytes.fill(0)),
}));

vi.mock("@lfspm/core/lib", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@lfspm/core/lib")>();

  return {
    ...actual,
    bestEffortWipeArrayBuffers: bestEffortWipeArrayBuffersSpy,
    secureWipe: secureWipeSpy,
  };
});

beforeEach(() => {
  bestEffortWipeArrayBuffersSpy.mockClear();
  secureWipeSpy.mockClear();
});

function createStorageArea(initialRecords: Record<string, unknown> = {}) {
  let records = { ...initialRecords };
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
      records = {
        ...records,
        ...items,
      };
    },
    async remove(keys: string | string[]) {
      const keysToRemove = new Set(Array.isArray(keys) ? keys : [keys]);
      records = Object.fromEntries(
        Object.entries(records).filter(
          ([recordKey]) => !keysToRemove.has(recordKey),
        ),
      );
    },
  };

  return {
    getRecords: () => records,
    storageArea,
  };
}

function createMaterial() {
  return {
    sessionId: "session-id",
    vaultId: "vault-id",
    sourceSnapshotVersionVector: {
      "device-id": 7,
    },
    deviceId: "device-id",
    vaultMasterKey: arrayBuffer(1, 2, 3) as VaultMasterKey,
    devicePrivateSignKey: arrayBuffer(4, 5, 6) as DevicePrivateSignKey,
    devicePrivateVaultKey: arrayBuffer(7, 8, 9) as DeviceVaultPrivateKey,
    deviceLocalProtectionKey: arrayBuffer(
      10,
      11,
      12,
    ) as DeviceLocalProtectionKey,
    payloadKey: arrayBuffer(13, 14, 15) as UnlockedVaultSessionPayloadKey,
    trustedSnapshotContext: {
      snapshotDigest: "snapshot-digest",
      trust: {
        generation: 2,
        vaultKeyGeneration: 3,
        certificateDigest: "certificate-digest",
        trustedDevices: [
          {
            deviceId: "device-id",
            publicSignKey: arrayBuffer(16, 17, 18) as DevicePublicSignKey,
            publicVaultKey: arrayBuffer(19, 20, 21) as DeviceVaultPublicKey,
          },
        ],
      },
    },
    vaultTrustAnchor: {
      version: 1 as const,
      vaultId: "vault-id",
      genesisDeviceId: "device-id",
      genesisPublicSignKey: arrayBuffer(22, 23, 24) as DevicePublicSignKey,
      genesisCertificateDigest: "genesis-certificate-digest",
    },
  };
}

describe("ChromeUnlockedVaultSessionMaterialRepository", () => {
  it("saves session material as storage-safe strings", async () => {
    const { getRecords, storageArea } = createStorageArea();
    const repository = new ChromeUnlockedVaultSessionMaterialRepository(
      storageArea,
    );
    const material = createMaterial();

    await repository.saveUnlockedVaultSessionMaterial(material);

    expect(getRecords()[UNLOCKED_VAULT_SESSION_MATERIAL_STORAGE_KEY]).toEqual({
      sessionId: "session-id",
      vaultId: "vault-id",
      sourceSnapshotVersionVector: {
        "device-id": 7,
      },
      deviceId: "device-id",
      vaultMasterKey: "AQID",
      devicePrivateSignKey: "BAUG",
      devicePrivateVaultKey: "BwgJ",
      deviceLocalProtectionKey: "CgsM",
      payloadKey: "DQ4P",
      trustedSnapshotContext: {
        snapshotDigest: "snapshot-digest",
        trust: {
          generation: 2,
          vaultKeyGeneration: 3,
          certificateDigest: "certificate-digest",
          trustedDevices: [
            {
              deviceId: "device-id",
              publicSignKey: "EBES",
              publicVaultKey: "ExQV",
            },
          ],
        },
      },
      vaultTrustAnchor: {
        version: 1,
        vaultId: "vault-id",
        genesisDeviceId: "device-id",
        genesisPublicSignKey: "FhcY",
        genesisCertificateDigest: "genesis-certificate-digest",
      },
    });
    await expect(repository.getUnlockedVaultSessionMaterial()).resolves.toBe(
      material,
    );
  });

  it("restores session material from storage", async () => {
    const { storageArea } = createStorageArea({
      [UNLOCKED_VAULT_SESSION_MATERIAL_STORAGE_KEY]: {
        sessionId: "session-id",
        vaultId: "vault-id",
        sourceSnapshotVersionVector: {
          "device-id": 7,
        },
        deviceId: "device-id",
        vaultMasterKey: "AQID",
        devicePrivateSignKey: "BAUG",
        devicePrivateVaultKey: "BwgJ",
        deviceLocalProtectionKey: "CgsM",
        payloadKey: "DQ4P",
        trustedSnapshotContext: {
          snapshotDigest: "snapshot-digest",
          trust: {
            generation: 2,
            vaultKeyGeneration: 3,
            certificateDigest: "certificate-digest",
            trustedDevices: [
              {
                deviceId: "device-id",
                publicSignKey: "EBES",
                publicVaultKey: "ExQV",
              },
            ],
          },
        },
        vaultTrustAnchor: {
          version: 1,
          vaultId: "vault-id",
          genesisDeviceId: "device-id",
          genesisPublicSignKey: "FhcY",
          genesisCertificateDigest: "genesis-certificate-digest",
        },
      },
    });
    const repository = new ChromeUnlockedVaultSessionMaterialRepository(
      storageArea,
    );

    const result = await repository.getUnlockedVaultSessionMaterial();
    const repeatedResult = await repository.getUnlockedVaultSessionMaterial();

    expect(result).toEqual(createMaterial());
    expect(repeatedResult).toBe(result);
    expect(secureWipeSpy).toHaveBeenCalledTimes(8);
    for (const [temporaryBytes] of secureWipeSpy.mock.calls) {
      expect(Array.from(temporaryBytes)).toEqual(
        Array.from({ length: temporaryBytes.length }, () => 0),
      );
    }
  });

  it("returns one decoded material identity to concurrent cold readers", async () => {
    const { storageArea } = createStorageArea();
    const writer = new ChromeUnlockedVaultSessionMaterialRepository(
      storageArea,
    );
    await writer.saveUnlockedVaultSessionMaterial(createMaterial());
    const get = vi.fn(storageArea.get);
    const reader = new ChromeUnlockedVaultSessionMaterialRepository({
      ...storageArea,
      get,
    });

    const [first, second] = await Promise.all([
      reader.getUnlockedVaultSessionMaterial(),
      reader.getUnlockedVaultSessionMaterial(),
    ]);

    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect(get).toHaveBeenCalledOnce();
  });

  it("does not let a delayed cold read repopulate material after removal", async () => {
    const { storageArea } = createStorageArea();
    const writer = new ChromeUnlockedVaultSessionMaterialRepository(
      storageArea,
    );
    await writer.saveUnlockedVaultSessionMaterial(createMaterial());
    const storedRecords = await storageArea.get(
      UNLOCKED_VAULT_SESSION_MATERIAL_STORAGE_KEY,
    );
    let markGetStarted!: () => void;
    let resolveGet!: (records: Record<string, unknown>) => void;
    const getStarted = new Promise<void>((resolve) => {
      markGetStarted = resolve;
    });
    const delayedRecords = new Promise<Record<string, unknown>>((resolve) => {
      resolveGet = resolve;
    });
    const get = vi.fn(async () => {
      markGetStarted();
      return delayedRecords;
    });
    const remove = vi.fn(storageArea.remove);
    const reader = new ChromeUnlockedVaultSessionMaterialRepository({
      ...storageArea,
      get,
      remove,
    });

    const pendingRead = reader.getUnlockedVaultSessionMaterial();
    await getStarted;
    const pendingRemoval = reader.removeUnlockedVaultSessionMaterial();

    expect(remove).not.toHaveBeenCalled();
    resolveGet(storedRecords);
    await expect(pendingRead).resolves.not.toBeNull();
    await expect(pendingRemoval).resolves.toBeUndefined();
    await expect(reader.getUnlockedVaultSessionMaterial()).resolves.toBeNull();
    expect(get).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
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
        sourceSnapshotVersionVector: {
          "device-id": 7,
        },
        deviceId: "device-id",
        vaultMasterKey: "AQID",
        devicePrivateSignKey: "BAUG",
        devicePrivateVaultKey: "BwgJ",
        deviceLocalProtectionKey: "CgsM",
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

  it("wipes decoded secret copies when a later secret cannot be decoded", async () => {
    const { storageArea } = createStorageArea({
      [UNLOCKED_VAULT_SESSION_MATERIAL_STORAGE_KEY]: {
        sessionId: "session-id",
        vaultId: "vault-id",
        sourceSnapshotVersionVector: { "device-id": 7 },
        deviceId: "device-id",
        vaultMasterKey: "AQID",
        devicePrivateSignKey: "BAUG",
        devicePrivateVaultKey: "!",
        deviceLocalProtectionKey: "CgsM",
        payloadKey: "DQ4P",
        trustedSnapshotContext: {
          snapshotDigest: "snapshot-digest",
          trust: {
            generation: 2,
            vaultKeyGeneration: 3,
            certificateDigest: "certificate-digest",
            trustedDevices: [],
          },
        },
        vaultTrustAnchor: {
          version: 1,
          vaultId: "vault-id",
          genesisDeviceId: "device-id",
          genesisPublicSignKey: "FhcY",
          genesisCertificateDigest: "genesis-certificate-digest",
        },
      },
    });
    const repository = new ChromeUnlockedVaultSessionMaterialRepository(
      storageArea,
    );

    await expect(
      repository.getUnlockedVaultSessionMaterial(),
    ).rejects.toThrow();

    expect(secureWipeSpy).toHaveBeenCalledTimes(2);
    expect(bestEffortWipeArrayBuffersSpy).toHaveBeenCalledTimes(1);
    const decodedSecrets = bestEffortWipeArrayBuffersSpy.mock.calls[0]![0];
    expect(decodedSecrets).toHaveLength(2);
    for (const secret of decodedSecrets) {
      expect(Array.from(new Uint8Array(secret!))).toEqual([0, 0, 0]);
    }
  });

  it("removes session material", async () => {
    const { getRecords, storageArea } = createStorageArea();
    const repository = new ChromeUnlockedVaultSessionMaterialRepository(
      storageArea,
    );
    const material = createMaterial();
    await repository.saveUnlockedVaultSessionMaterial(material);

    await repository.removeUnlockedVaultSessionMaterial();

    expect(getRecords()).not.toHaveProperty(
      UNLOCKED_VAULT_SESSION_MATERIAL_STORAGE_KEY,
    );
    await expect(
      repository.getUnlockedVaultSessionMaterial(),
    ).resolves.toBeNull();
  });

  it("keeps session material logically removed when storage removal fails", async () => {
    const { getRecords, storageArea } = createStorageArea();
    const get = vi.fn(storageArea.get);
    const removeError = new Error("storage removal failed");
    const failingStorageArea: ChromeStorageArea = {
      ...storageArea,
      get,
      remove: vi.fn(async () => {
        throw removeError;
      }),
    };
    const repository = new ChromeUnlockedVaultSessionMaterialRepository(
      failingStorageArea,
    );
    await repository.saveUnlockedVaultSessionMaterial(createMaterial());

    await expect(repository.removeUnlockedVaultSessionMaterial()).rejects.toBe(
      removeError,
    );

    expect(getRecords()).toHaveProperty(
      UNLOCKED_VAULT_SESSION_MATERIAL_STORAGE_KEY,
    );
    await expect(
      repository.getUnlockedVaultSessionMaterial(),
    ).resolves.toBeNull();
    expect(get).not.toHaveBeenCalled();
  });
});

function arrayBuffer(...bytes: number[]): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}
