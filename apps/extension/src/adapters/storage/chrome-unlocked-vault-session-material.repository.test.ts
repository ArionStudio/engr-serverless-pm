import { beforeEach, describe, expect, it, vi } from "vitest";
import { CURRENT_ALGORITHM_SUITE } from "@lfspm/core";
import type {
  DeviceLocalProtectionKey,
  DevicePrivateSignKey,
  DevicePublicSignKey,
  DeviceVaultPrivateKey,
  DeviceVaultPublicKey,
  UnlockedVaultSessionPayloadKey,
  VaultMasterKey,
} from "@lfspm/core";
import { decodeBase64Url, encodeBase64Url } from "@lfspm/core/lib";
import type { Base64URLString } from "@lfspm/core/lib";
import { createChromeStorageArea } from "../../__tests__/fixtures/chrome-storage-area";
import {
  ChromeUnlockedVaultSessionMaterialRepository,
  UNLOCKED_VAULT_SESSION_EPOCH_STORAGE_KEY,
  UNLOCKED_VAULT_SESSION_MATERIAL_STORAGE_KEY,
} from "./chrome-unlocked-vault-session-material.repository";
import type { ChromeStorageArea } from "./chrome-storage-area";
import { InvalidUnlockedVaultSessionMaterialError } from "./unlocked-vault-session-material.codec";

const ED25519_PUBLIC_KEY = "Fqs-ZEF094DwnmgIP_3vW66vR7a3roKY4a6rHcf_Mbg";
const ED25519_PRIVATE_KEY =
  "MC4CAQAwBQYDK2VwBCIEIKCpkcLGPXOj3QmuhXSqbSzyR9QxZsgQRcHKuEBgvBGS";
const P256_PUBLIC_KEY =
  "BGHA1gXNkZGy7nD5xmWFenBCQYwNDXk_JvqcNfVsq9rQ4951gUvzZy3aDWK6yj5FRZqAimQvURlj6i-I8aYbzNg";
const P256_PRIVATE_KEY =
  "MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgWiqUpCPje41XhU_gfBax1XuzrKagNbTrY97LNjclW2ehRANCAARhwNYFzZGRsu5w-cZlhXpwQkGMDQ15Pyb6nDX1bKva0OPedYFL82ct2g1iuso-RUWagIpkL1EZY-oviPGmG8zY";

const { bestEffortWipeArrayBuffersSpy } = vi.hoisted(() => ({
  bestEffortWipeArrayBuffersSpy: vi.fn(
    (buffers: readonly (ArrayBuffer | undefined)[]) => {
      for (const buffer of buffers) {
        if (buffer !== undefined) {
          new Uint8Array(buffer).fill(0);
        }
      }
    },
  ),
}));

vi.mock("@lfspm/core/lib", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@lfspm/core/lib")>();

  return {
    ...actual,
    bestEffortWipeArrayBuffers: bestEffortWipeArrayBuffersSpy,
  };
});

beforeEach(() => {
  bestEffortWipeArrayBuffersSpy.mockClear();
});
function createMaterial() {
  return {
    sessionId: "session-id",
    vaultId: "vault-id",
    sourceSnapshotVersionVector: {
      "device-id": 7,
    },
    deviceId: "device-id",
    vaultMasterKey: filledBuffer(1, 32) as VaultMasterKey,
    devicePrivateSignKey: decodeBuffer(
      ED25519_PRIVATE_KEY,
    ) as DevicePrivateSignKey,
    devicePrivateVaultKey: decodeBuffer(
      P256_PRIVATE_KEY,
    ) as DeviceVaultPrivateKey,
    deviceLocalProtectionKey: filledBuffer(
      2,
      CURRENT_ALGORITHM_SUITE.deviceLocalProtectionKeyGeneration.byteLength,
    ) as DeviceLocalProtectionKey,
    payloadKey: filledBuffer(
      3,
      CURRENT_ALGORITHM_SUITE.unlockedVaultSessionPayloadKeyGeneration
        .byteLength,
    ) as UnlockedVaultSessionPayloadKey,
    trustedSnapshotContext: {
      snapshotDigest: digest(4),
      trust: {
        generation: 2,
        vaultKeyGeneration: 3,
        certificateDigest: digest(5),
        trustedDevices: [
          {
            deviceId: "device-id",
            publicSignKey: decodeBuffer(
              ED25519_PUBLIC_KEY,
            ) as DevicePublicSignKey,
            publicVaultKey: decodeBuffer(
              P256_PUBLIC_KEY,
            ) as DeviceVaultPublicKey,
          },
        ],
      },
    },
    vaultTrustAnchor: {
      version: 1 as const,
      vaultId: "vault-id",
      genesisDeviceId: "device-id",
      genesisPublicSignKey: decodeBuffer(
        ED25519_PUBLIC_KEY,
      ) as DevicePublicSignKey,
      genesisCertificateDigest: digest(6),
    },
  };
}

function createStoredMaterial() {
  const material = createMaterial();
  return {
    sessionId: material.sessionId,
    vaultId: material.vaultId,
    sourceSnapshotVersionVector: material.sourceSnapshotVersionVector,
    deviceId: material.deviceId,
    vaultMasterKey: encodeBuffer(material.vaultMasterKey),
    devicePrivateSignKey: encodeBuffer(material.devicePrivateSignKey),
    devicePrivateVaultKey: encodeBuffer(material.devicePrivateVaultKey),
    deviceLocalProtectionKey: encodeBuffer(material.deviceLocalProtectionKey),
    payloadKey: encodeBuffer(material.payloadKey),
    trustedSnapshotContext: {
      snapshotDigest: material.trustedSnapshotContext.snapshotDigest,
      trust: {
        generation: material.trustedSnapshotContext.trust.generation,
        vaultKeyGeneration:
          material.trustedSnapshotContext.trust.vaultKeyGeneration,
        certificateDigest:
          material.trustedSnapshotContext.trust.certificateDigest,
        trustedDevices:
          material.trustedSnapshotContext.trust.trustedDevices.map(
            (device) => ({
              deviceId: device.deviceId,
              publicSignKey: encodeBuffer(device.publicSignKey),
              publicVaultKey: encodeBuffer(device.publicVaultKey),
            }),
          ),
      },
    },
    vaultTrustAnchor: {
      version: material.vaultTrustAnchor.version,
      vaultId: material.vaultTrustAnchor.vaultId,
      genesisDeviceId: material.vaultTrustAnchor.genesisDeviceId,
      genesisPublicSignKey: encodeBuffer(
        material.vaultTrustAnchor.genesisPublicSignKey,
      ),
      genesisCertificateDigest:
        material.vaultTrustAnchor.genesisCertificateDigest,
    },
  };
}

describe("ChromeUnlockedVaultSessionMaterialRepository", () => {
  it("saves session material as storage-safe strings", async () => {
    const { getRecords, storageArea } = createChromeStorageArea();
    const repository = new ChromeUnlockedVaultSessionMaterialRepository(
      storageArea,
    );
    const material = createMaterial();

    await repository.saveUnlockedVaultSessionMaterial(material);

    expect(getRecords()[UNLOCKED_VAULT_SESSION_MATERIAL_STORAGE_KEY]).toEqual(
      createStoredMaterial(),
    );
    await expect(repository.getUnlockedVaultSessionMaterial()).resolves.toBe(
      material,
    );
  });

  it("restores session material from storage", async () => {
    const { storageArea } = createChromeStorageArea({
      [UNLOCKED_VAULT_SESSION_MATERIAL_STORAGE_KEY]: createStoredMaterial(),
    });
    const repository = new ChromeUnlockedVaultSessionMaterialRepository(
      storageArea,
    );

    const result = await repository.getUnlockedVaultSessionMaterial();
    const repeatedResult = await repository.getUnlockedVaultSessionMaterial();

    expect(result).toEqual(createMaterial());
    expect(repeatedResult).toBe(result);
  });

  it("returns one decoded material identity to concurrent cold readers", async () => {
    const { storageArea } = createChromeStorageArea();
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

  it("reads the shared identity without trusting a cached absence", async () => {
    const { storageArea } = createChromeStorageArea();
    const reader = new ChromeUnlockedVaultSessionMaterialRepository(
      storageArea,
    );
    const writer = new ChromeUnlockedVaultSessionMaterialRepository(
      storageArea,
    );

    await reader.removeUnlockedVaultSessionMaterial();
    await writer.saveUnlockedVaultSessionMaterial(createMaterial());

    await expect(
      reader.getPersistedUnlockedVaultSessionIdentity(),
    ).resolves.toEqual({
      sessionId: "session-id",
      vaultId: "vault-id",
      sourceSnapshotVersionVector: { "device-id": 7 },
    });
    await expect(reader.getUnlockedVaultSessionMaterial()).resolves.toBeNull();

    await reader.evictCachedUnlockedVaultSessionMaterial(null);
    await expect(reader.getUnlockedVaultSessionMaterial()).resolves.toEqual(
      createMaterial(),
    );
  });

  it("shares a volatile lifecycle epoch across repository instances", async () => {
    const { getRecords, storageArea } = createChromeStorageArea();
    const first = new ChromeUnlockedVaultSessionMaterialRepository(storageArea);
    const second = new ChromeUnlockedVaultSessionMaterialRepository(
      storageArea,
    );

    await expect(first.getUnlockedVaultSessionEpoch()).resolves.toBe(0);
    await first.advanceUnlockedVaultSessionEpoch();

    await expect(second.getUnlockedVaultSessionEpoch()).resolves.toBe(1);
    expect(getRecords()[UNLOCKED_VAULT_SESSION_EPOCH_STORAGE_KEY]).toBe(1);
  });

  it("preserves the lifecycle epoch when session material is removed", async () => {
    const { storageArea } = createChromeStorageArea({
      [UNLOCKED_VAULT_SESSION_EPOCH_STORAGE_KEY]: 7,
    });
    const repository = new ChromeUnlockedVaultSessionMaterialRepository(
      storageArea,
    );
    await repository.saveUnlockedVaultSessionMaterial(createMaterial());

    await repository.removeUnlockedVaultSessionMaterial();

    await expect(repository.getUnlockedVaultSessionEpoch()).resolves.toBe(7);
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "1", null])(
    "rejects malformed lifecycle epoch metadata: %s",
    async (epoch) => {
      const { storageArea } = createChromeStorageArea({
        [UNLOCKED_VAULT_SESSION_EPOCH_STORAGE_KEY]: epoch,
      });
      const repository = new ChromeUnlockedVaultSessionMaterialRepository(
        storageArea,
      );

      await expect(repository.getUnlockedVaultSessionEpoch()).rejects.toThrow(
        "Unlocked vault session epoch is malformed.",
      );
    },
  );

  it("fails closed when the lifecycle epoch is exhausted", async () => {
    const { storageArea } = createChromeStorageArea({
      [UNLOCKED_VAULT_SESSION_EPOCH_STORAGE_KEY]: Number.MAX_SAFE_INTEGER,
    });
    const repository = new ChromeUnlockedVaultSessionMaterialRepository(
      storageArea,
    );

    await expect(repository.advanceUnlockedVaultSessionEpoch()).rejects.toThrow(
      "Unlocked vault session epoch is exhausted.",
    );
  });

  it("does not roll back an epoch that storage committed before rejecting", async () => {
    const { storageArea } = createChromeStorageArea();
    const setError = new Error("storage acknowledgement failed");
    const writer = new ChromeUnlockedVaultSessionMaterialRepository({
      ...storageArea,
      set: vi.fn(async (items) => {
        await storageArea.set(items);
        throw setError;
      }),
    });
    const reader = new ChromeUnlockedVaultSessionMaterialRepository(
      storageArea,
    );

    await expect(writer.advanceUnlockedVaultSessionEpoch()).rejects.toBe(
      setError,
    );
    await expect(reader.getUnlockedVaultSessionEpoch()).resolves.toBe(1);
  });

  it("evicts only the matching local cache and reloads shared material", async () => {
    const { storageArea } = createChromeStorageArea();
    const writer = new ChromeUnlockedVaultSessionMaterialRepository(
      storageArea,
    );
    const reader = new ChromeUnlockedVaultSessionMaterialRepository(
      storageArea,
    );
    await writer.saveUnlockedVaultSessionMaterial(createMaterial());
    const cachedMaterial = await reader.getUnlockedVaultSessionMaterial();
    const replacementMaterial = {
      ...createMaterial(),
      sessionId: "replacement-session-id",
      sourceSnapshotVersionVector: { "device-id": 8 },
    };
    await writer.saveUnlockedVaultSessionMaterial(replacementMaterial);

    await reader.evictCachedUnlockedVaultSessionMaterial("session-id");

    const reloadedMaterial = await reader.getUnlockedVaultSessionMaterial();
    expect(reloadedMaterial).toEqual(replacementMaterial);
    await reader.evictCachedUnlockedVaultSessionMaterial(null);
    await expect(reader.getUnlockedVaultSessionMaterial()).resolves.toBe(
      reloadedMaterial,
    );
    await reader.evictCachedUnlockedVaultSessionMaterial("session-id");
    await expect(reader.getUnlockedVaultSessionMaterial()).resolves.toBe(
      reloadedMaterial,
    );
    expect(cachedMaterial?.sessionId).toBe("session-id");
    await expect(
      reader.getPersistedUnlockedVaultSessionIdentity(),
    ).resolves.toEqual({
      sessionId: "replacement-session-id",
      vaultId: "vault-id",
      sourceSnapshotVersionVector: { "device-id": 8 },
    });
  });

  it("does not let a delayed cold read repopulate material after removal", async () => {
    const { storageArea } = createChromeStorageArea();
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
    const { storageArea } = createChromeStorageArea();
    const repository = new ChromeUnlockedVaultSessionMaterialRepository(
      storageArea,
    );

    await expect(
      repository.getUnlockedVaultSessionMaterial(),
    ).resolves.toBeNull();
  });

  it("exposes one static secret-free error for malformed material", async () => {
    const hostileMaterial = {
      ...createStoredMaterial(),
      payloadKey: null,
    };
    const { storageArea } = createChromeStorageArea({
      [UNLOCKED_VAULT_SESSION_MATERIAL_STORAGE_KEY]: hostileMaterial,
    });
    const repository = new ChromeUnlockedVaultSessionMaterialRepository(
      storageArea,
    );

    const error = await captureRejection(
      repository.getUnlockedVaultSessionMaterial(),
    );

    expect(error).toBeInstanceOf(InvalidUnlockedVaultSessionMaterialError);
    expect(error).toMatchObject({
      name: "InvalidUnlockedVaultSessionMaterialError",
      message: "Unlocked vault session material is malformed.",
    });
    expect(Object.hasOwn(error, "cause")).toBe(false);
    expect(Object.hasOwn(error, "input")).toBe(false);
    expect(Object.hasOwn(error, "material")).toBe(false);
    expect(Object.values(error)).not.toContain(hostileMaterial);
  });

  it("rejects extras, unsafe counters, duplicate identities, and inconsistent context", async () => {
    const stored = createStoredMaterial();
    const trustedDevice =
      stored.trustedSnapshotContext.trust.trustedDevices[0]!;
    const hostileRecords: unknown[] = [
      { ...stored, unexpected: true },
      {
        ...stored,
        trustedSnapshotContext: {
          ...stored.trustedSnapshotContext,
          unexpected: true,
        },
      },
      {
        ...stored,
        trustedSnapshotContext: {
          ...stored.trustedSnapshotContext,
          trust: {
            ...stored.trustedSnapshotContext.trust,
            unexpected: true,
          },
        },
      },
      {
        ...stored,
        trustedSnapshotContext: {
          ...stored.trustedSnapshotContext,
          trust: {
            ...stored.trustedSnapshotContext.trust,
            trustedDevices: [{ ...trustedDevice, unexpected: true }],
          },
        },
      },
      {
        ...stored,
        vaultTrustAnchor: { ...stored.vaultTrustAnchor, unexpected: true },
      },
      { ...stored, sourceSnapshotVersionVector: { "device-id": -1 } },
      { ...stored, sourceSnapshotVersionVector: { "device-id": 1.5 } },
      { ...stored, sourceSnapshotVersionVector: new ArrayBuffer(0) },
      {
        ...stored,
        sourceSnapshotVersionVector: {
          "device-id": Number.MAX_SAFE_INTEGER + 1,
        },
      },
      {
        ...stored,
        trustedSnapshotContext: {
          ...stored.trustedSnapshotContext,
          trust: {
            ...stored.trustedSnapshotContext.trust,
            generation: Number.POSITIVE_INFINITY,
          },
        },
      },
      {
        ...stored,
        trustedSnapshotContext: {
          ...stored.trustedSnapshotContext,
          trust: {
            ...stored.trustedSnapshotContext.trust,
            vaultKeyGeneration: 0,
          },
        },
      },
      {
        ...stored,
        trustedSnapshotContext: {
          ...stored.trustedSnapshotContext,
          trust: {
            ...stored.trustedSnapshotContext.trust,
            vaultKeyGeneration: -1,
          },
        },
      },
      {
        ...stored,
        trustedSnapshotContext: {
          ...stored.trustedSnapshotContext,
          trust: {
            ...stored.trustedSnapshotContext.trust,
            trustedDevices: [trustedDevice, { ...trustedDevice }],
          },
        },
      },
      {
        ...stored,
        deviceId: "untrusted-device-id",
      },
      {
        ...stored,
        vaultTrustAnchor: {
          ...stored.vaultTrustAnchor,
          vaultId: "other-vault-id",
        },
      },
      {
        ...stored,
        vaultTrustAnchor: {
          ...stored.vaultTrustAnchor,
          genesisPublicSignKey: encodeBuffer(filledBuffer(0, 32)),
        },
      },
    ];

    for (const hostileRecord of hostileRecords) {
      await expectInvalidMaterial(hostileRecord);
    }
  });

  it("rejects noncanonical encodings, wrong byte lengths, and non-importable keys", async () => {
    const stored = createStoredMaterial();
    const trustedDevice =
      stored.trustedSnapshotContext.trust.trustedDevices[0]!;
    const hostileRecords: unknown[] = [
      { ...stored, payloadKey: `${stored.payloadKey}=` },
      { ...stored, vaultMasterKey: encodeBuffer(filledBuffer(1, 31)) },
      {
        ...stored,
        deviceLocalProtectionKey: encodeBuffer(filledBuffer(1, 31)),
      },
      { ...stored, payloadKey: encodeBuffer(filledBuffer(1, 31)) },
      {
        ...stored,
        trustedSnapshotContext: {
          ...stored.trustedSnapshotContext,
          snapshotDigest: encodeBuffer(filledBuffer(1, 31)),
        },
      },
      {
        ...stored,
        trustedSnapshotContext: {
          ...stored.trustedSnapshotContext,
          trust: {
            ...stored.trustedSnapshotContext.trust,
            certificateDigest: `${stored.trustedSnapshotContext.trust.certificateDigest}=`,
          },
        },
      },
      {
        ...stored,
        trustedSnapshotContext: {
          ...stored.trustedSnapshotContext,
          trust: {
            ...stored.trustedSnapshotContext.trust,
            trustedDevices: [
              {
                ...trustedDevice,
                publicSignKey: encodeBuffer(filledBuffer(1, 31)),
              },
            ],
          },
        },
      },
      {
        ...stored,
        trustedSnapshotContext: {
          ...stored.trustedSnapshotContext,
          trust: {
            ...stored.trustedSnapshotContext.trust,
            trustedDevices: [
              {
                ...trustedDevice,
                publicVaultKey: encodeBuffer(filledBuffer(1, 64)),
              },
            ],
          },
        },
      },
      {
        ...stored,
        vaultTrustAnchor: {
          ...stored.vaultTrustAnchor,
          genesisCertificateDigest: encodeBuffer(filledBuffer(1, 31)),
        },
      },
      {
        ...stored,
        devicePrivateSignKey: encodeBuffer(
          filledBuffer(0, decodeBuffer(ED25519_PRIVATE_KEY).byteLength),
        ),
      },
      {
        ...stored,
        trustedSnapshotContext: {
          ...stored.trustedSnapshotContext,
          trust: {
            ...stored.trustedSnapshotContext.trust,
            trustedDevices: [
              {
                ...trustedDevice,
                publicVaultKey: encodeBuffer(filledBuffer(0, 65)),
              },
            ],
          },
        },
      },
    ];

    for (const hostileRecord of hostileRecords) {
      await expectInvalidMaterial(hostileRecord);
    }
  });

  it("applies full material validation before projecting persisted identity", async () => {
    const stored = createStoredMaterial();
    const { storageArea } = createChromeStorageArea({
      [UNLOCKED_VAULT_SESSION_MATERIAL_STORAGE_KEY]: {
        ...stored,
        devicePrivateSignKey: encodeBuffer(
          filledBuffer(0, decodeBuffer(ED25519_PRIVATE_KEY).byteLength),
        ),
      },
    });
    const repository = new ChromeUnlockedVaultSessionMaterialRepository(
      storageArea,
    );

    await expect(
      repository.getPersistedUnlockedVaultSessionIdentity(),
    ).rejects.toBeInstanceOf(InvalidUnlockedVaultSessionMaterialError);
  });

  it("performs no asymmetric key import when outer validation fails", async () => {
    const validator = {
      importDeviceSignPublicKey: vi.fn(async (): Promise<CryptoKey> => {
        throw new Error("Unexpected key import.");
      }),
      importDeviceSignPrivateKey: vi.fn(async (): Promise<CryptoKey> => {
        throw new Error("Unexpected key import.");
      }),
      importDeviceVaultPublicKey: vi.fn(async (): Promise<CryptoKey> => {
        throw new Error("Unexpected key import.");
      }),
      importDeviceVaultPrivateKey: vi.fn(async (): Promise<CryptoKey> => {
        throw new Error("Unexpected key import.");
      }),
    };
    const { storageArea } = createChromeStorageArea({
      [UNLOCKED_VAULT_SESSION_MATERIAL_STORAGE_KEY]: {
        ...createStoredMaterial(),
        unexpected: true,
      },
    });
    const repository = new ChromeUnlockedVaultSessionMaterialRepository(
      storageArea,
      UNLOCKED_VAULT_SESSION_MATERIAL_STORAGE_KEY,
      UNLOCKED_VAULT_SESSION_EPOCH_STORAGE_KEY,
      validator,
    );

    await expect(
      repository.getUnlockedVaultSessionMaterial(),
    ).rejects.toBeInstanceOf(InvalidUnlockedVaultSessionMaterialError);
    expect(validator.importDeviceSignPublicKey).not.toHaveBeenCalled();
    expect(validator.importDeviceSignPrivateKey).not.toHaveBeenCalled();
    expect(validator.importDeviceVaultPublicKey).not.toHaveBeenCalled();
    expect(validator.importDeviceVaultPrivateKey).not.toHaveBeenCalled();
  });

  it("wipes decoded secret copies when a later secret cannot be decoded", async () => {
    const stored = createStoredMaterial();
    const { storageArea } = createChromeStorageArea({
      [UNLOCKED_VAULT_SESSION_MATERIAL_STORAGE_KEY]: {
        ...stored,
        devicePrivateVaultKey: "!",
      },
    });
    const repository = new ChromeUnlockedVaultSessionMaterialRepository(
      storageArea,
    );

    await expect(
      repository.getUnlockedVaultSessionMaterial(),
    ).rejects.toThrow();

    expect(bestEffortWipeArrayBuffersSpy).toHaveBeenCalledTimes(1);
    const decodedSecrets = bestEffortWipeArrayBuffersSpy.mock.calls[0]![0];
    expect(decodedSecrets).toHaveLength(2);
    for (const secret of decodedSecrets) {
      expect(new Uint8Array(secret!).every((byte) => byte === 0)).toBe(true);
    }
  });

  it("removes session material", async () => {
    const { getRecords, storageArea } = createChromeStorageArea();
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
    const { getRecords, storageArea } = createChromeStorageArea();
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

function filledBuffer(value: number, byteLength: number): ArrayBuffer {
  return new Uint8Array(byteLength).fill(value).buffer;
}

function decodeBuffer(value: string): ArrayBuffer {
  return decodeBase64Url(value as Base64URLString).slice().buffer;
}

function encodeBuffer(value: ArrayBuffer): string {
  return encodeBase64Url(new Uint8Array(value));
}

function digest(value: number): string {
  return encodeBuffer(filledBuffer(value, 32));
}

async function captureRejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }
    throw new Error("Expected an Error rejection.");
  }
  throw new Error("Expected promise to reject.");
}

async function expectInvalidMaterial(material: unknown): Promise<void> {
  const { storageArea } = createChromeStorageArea({
    [UNLOCKED_VAULT_SESSION_MATERIAL_STORAGE_KEY]: material,
  });
  const repository = new ChromeUnlockedVaultSessionMaterialRepository(
    storageArea,
  );

  await expect(
    repository.getUnlockedVaultSessionMaterial(),
  ).rejects.toMatchObject({
    name: "InvalidUnlockedVaultSessionMaterialError",
    message: "Unlocked vault session material is malformed.",
  });
}
