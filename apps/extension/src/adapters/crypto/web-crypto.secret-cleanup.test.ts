import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CURRENT_ALGORITHM_SUITE,
  type DeviceEnrollmentPrivateState,
  type DeviceEnrollmentRequestPayload,
  type LocalKeysPayload,
  type ProtectionKeyFor,
  type RawMasterPassword,
} from "@lfspm/core";
import { encodeBase64Url } from "@lfspm/core/lib";
import {
  decodeDeviceEnrollmentPrivateState,
  encodeDeviceEnrollmentPrivateState,
} from "../codecs/device-enrollment-artifact.codec";
import {
  decodeLocalKeysPayload,
  encodeLocalKeysPayload,
} from "../codecs/local-vault-security.codec";
import { type AsymmetricKeyValidator, WebCryptoPort } from "./web-crypto.port";

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

describe("WebCryptoPort secret cleanup", () => {
  it("wipes partially decoded local secrets when a late trust-anchor field is malformed", async () => {
    const producer = new WebCryptoPort();
    const signing = await producer.generateDeviceSignKeyPair();
    const vault = await producer.generateDeviceVaultKeyPair();
    const encoded = encodeLocalKeysPayload({
      devicePrivateSignKey: signing.privateKey,
      devicePrivateVaultKey: vault.privateKey,
      deviceLocalProtectionKey:
        await producer.generateDeviceLocalProtectionKey(),
      vaultTrustAnchor: {
        version: 1,
        vaultId: "vault-id",
        genesisDeviceId: "device-id",
        genesisPublicSignKey: signing.publicKey,
        genesisCertificateDigest: digest(1),
      },
    }) as Record<string, unknown>;
    bestEffortWipeArrayBuffersSpy.mockClear();

    expect(() =>
      decodeLocalKeysPayload({ ...encoded, vaultTrustAnchor: {} }),
    ).toThrow("Local keys payload is malformed.");

    expect(bestEffortWipeArrayBuffersSpy).toHaveBeenCalledOnce();
    expectAllBuffersWiped(bestEffortWipeArrayBuffersSpy.mock.calls[0]![0]);
  });

  it("wipes partially decoded enrollment secrets when the final field is malformed", async () => {
    const fixture = await createEnrollmentFixture();
    const encoded = encodeDeviceEnrollmentPrivateState(
      fixture.privateState,
    ) as Record<string, unknown>;
    bestEffortWipeArrayBuffersSpy.mockClear();

    expect(() =>
      decodeDeviceEnrollmentPrivateState({
        ...encoded,
        deviceLocalProtectionKey: "malformed",
      }),
    ).toThrow("Device enrollment private state is malformed.");

    expect(bestEffortWipeArrayBuffersSpy).toHaveBeenCalledOnce();
    const wiped = bestEffortWipeArrayBuffersSpy.mock.calls[0]![0];
    expect(wiped.slice(0, 2)).toHaveLength(2);
    expectAllBuffersWiped(wiped.slice(0, 2));
    expect(wiped[2]).toBeUndefined();
  });

  it.each(["success", "failure"] as const)(
    "wipes the original encoded master password after derivation %s",
    async (outcome) => {
      const password = "secret master password" as RawMasterPassword;
      const expectedPasswordBytes = new TextEncoder().encode(password);
      const importedMaterial = await globalThis.crypto.subtle.importKey(
        "raw",
        expectedPasswordBytes,
        CURRENT_ALGORITHM_SUITE.localProtectionKeyDerivation.algorithm,
        false,
        ["deriveBits"],
      );
      let importedPasswordBytes: Uint8Array | undefined;
      const subtle = new Proxy(globalThis.crypto.subtle, {
        get(target, property, receiver) {
          if (property === "importKey") {
            return async (
              format: KeyFormat,
              keyData: BufferSource | JsonWebKey,
              algorithm: AlgorithmIdentifier,
            ) => {
              if (
                format === "raw" &&
                algorithmName(algorithm) ===
                  CURRENT_ALGORITHM_SUITE.localProtectionKeyDerivation.algorithm
              ) {
                if (!(keyData instanceof Uint8Array)) {
                  throw new Error("Expected encoded password bytes.");
                }
                importedPasswordBytes = keyData;
                expect(keyData).toEqual(expectedPasswordBytes);
                return importedMaterial;
              }

              throw new Error(
                `Unexpected ${String(format)} key import for ${algorithmName(algorithm)}.`,
              );
            };
          }
          if (property === "deriveBits") {
            return async () => {
              if (outcome === "failure") {
                throw new Error("injected PBKDF2 failure");
              }
              return new Uint8Array(32).fill(41).buffer;
            };
          }
          const value: unknown = Reflect.get(target, property, receiver);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      const crypto = new WebCryptoPort(withSubtle(subtle));
      const salt = await new WebCryptoPort().generateMasterPasswordSalt();
      const operation = crypto.deriveLocalRootKey(password, salt);

      if (outcome === "success") {
        await expect(operation).resolves.toHaveProperty("byteLength", 32);
      } else {
        await expect(operation).rejects.toThrow("injected PBKDF2 failure");
      }

      expect(importedPasswordBytes).toBeDefined();
      expect(importedPasswordBytes).not.toBe(expectedPasswordBytes);
      expect(importedPasswordBytes?.every((byte) => byte === 0)).toBe(true);
      expect(secureWipeSpy).toHaveBeenCalledOnce();
      expect(secureWipeSpy).toHaveBeenCalledWith(importedPasswordBytes);
    },
  );

  it("waits for every local-key import and wipes every decoded local secret after one import fails", async () => {
    const producer = new WebCryptoPort();
    const signing = await producer.generateDeviceSignKeyPair();
    const vault = await producer.generateDeviceVaultKeyPair();
    const localProtectionKey =
      await producer.generateDeviceLocalProtectionKey();
    const payload: LocalKeysPayload = {
      devicePrivateSignKey: signing.privateKey,
      devicePrivateVaultKey: vault.privateKey,
      deviceLocalProtectionKey: localProtectionKey,
      vaultTrustAnchor: {
        version: 1,
        vaultId: "vault-id",
        genesisDeviceId: "device-id",
        genesisPublicSignKey: signing.publicKey,
        genesisCertificateDigest: digest(1),
      },
    };
    const protectionKey =
      (await producer.generateDeviceLocalProtectionKey()) as unknown as ProtectionKeyFor<LocalKeysPayload>;
    const wrapped = await producer.wrapLocalKeysPayload(payload, protectionKey);
    const privateVaultImport = deferred<CryptoKey>();
    const publicSignImport = deferred<CryptoKey>();
    let decodedPrivateSignKey: ArrayBuffer | undefined;
    let decodedPrivateVaultKey: ArrayBuffer | undefined;
    const validator: AsymmetricKeyValidator = {
      importDeviceSignPrivateKey(privateKey) {
        decodedPrivateSignKey = privateKey;
        return Promise.reject(new Error("injected signing-key failure"));
      },
      importDeviceVaultPrivateKey(privateKey) {
        decodedPrivateVaultKey = privateKey;
        return privateVaultImport.promise;
      },
      importDeviceSignPublicKey() {
        return publicSignImport.promise;
      },
      importDeviceVaultPublicKey() {
        throw new Error("Unexpected public vault-key import.");
      },
    };
    bestEffortWipeArrayBuffersSpy.mockClear();
    const operation = new WebCryptoPort(
      globalThis.crypto,
      validator,
    ).unwrapLocalKeysPayload(wrapped, protectionKey);

    await vi.waitFor(() => {
      expect(decodedPrivateSignKey).toBeDefined();
      expect(decodedPrivateVaultKey).toBeDefined();
    });
    expect(bestEffortWipeArrayBuffersSpy).not.toHaveBeenCalled();

    privateVaultImport.resolve(fakeCryptoKey());
    await nextMicrotasks();
    expect(bestEffortWipeArrayBuffersSpy).not.toHaveBeenCalled();

    publicSignImport.resolve(fakeCryptoKey());
    await expect(operation).rejects.toMatchObject({
      name: "InvalidLocalKeysPayloadError",
      message: "Local keys payload is malformed.",
    });

    expect(bestEffortWipeArrayBuffersSpy).toHaveBeenCalledOnce();
    const wiped = bestEffortWipeArrayBuffersSpy.mock.calls[0]![0];
    expect(wiped).toHaveLength(3);
    expect(wiped[0]).toBe(decodedPrivateSignKey);
    expect(wiped[1]).toBe(decodedPrivateVaultKey);
    expect(wiped[2]?.byteLength).toBe(
      CURRENT_ALGORITHM_SUITE.deviceLocalProtectionKeyGeneration.byteLength,
    );
    expectAllBuffersWiped(wiped);
  });

  it("waits for every enrollment-key import and wipes every decoded enrollment secret after one import fails", async () => {
    const fixture = await createEnrollmentFixture();
    const privateVaultImport = deferred<CryptoKey>();
    const publicSignImport = deferred<CryptoKey>();
    const publicVaultImport = deferred<CryptoKey>();
    let decodedPrivateSignKey: ArrayBuffer | undefined;
    let decodedPrivateVaultKey: ArrayBuffer | undefined;
    const validator: AsymmetricKeyValidator = {
      importDeviceSignPrivateKey(privateKey) {
        decodedPrivateSignKey = privateKey;
        return Promise.reject(new Error("injected signing-key failure"));
      },
      importDeviceVaultPrivateKey(privateKey) {
        decodedPrivateVaultKey = privateKey;
        return privateVaultImport.promise;
      },
      importDeviceSignPublicKey() {
        return publicSignImport.promise;
      },
      importDeviceVaultPublicKey() {
        return publicVaultImport.promise;
      },
    };
    bestEffortWipeArrayBuffersSpy.mockClear();
    const operation = new WebCryptoPort(
      globalThis.crypto,
      validator,
    ).unwrapDeviceEnrollmentPrivateState(
      fixture.wrapped,
      fixture.protectionKey,
    );

    await vi.waitFor(() => {
      expect(decodedPrivateSignKey).toBeDefined();
      expect(decodedPrivateVaultKey).toBeDefined();
    });
    expect(bestEffortWipeArrayBuffersSpy).not.toHaveBeenCalled();

    privateVaultImport.resolve(fakeCryptoKey());
    publicSignImport.resolve(fakeCryptoKey());
    await nextMicrotasks();
    expect(bestEffortWipeArrayBuffersSpy).not.toHaveBeenCalled();

    publicVaultImport.resolve(fakeCryptoKey());
    await expect(operation).rejects.toMatchObject({
      name: "InvalidDeviceEnrollmentPrivateStateError",
      message: "Device enrollment private state is malformed.",
    });

    expect(bestEffortWipeArrayBuffersSpy).toHaveBeenCalledOnce();
    const wiped = bestEffortWipeArrayBuffersSpy.mock.calls[0]![0];
    expect(wiped).toHaveLength(3);
    expect(wiped[0]).toBe(decodedPrivateSignKey);
    expect(wiped[1]).toBe(decodedPrivateVaultKey);
    expect(wiped[2]?.byteLength).toBe(
      CURRENT_ALGORITHM_SUITE.deviceLocalProtectionKeyGeneration.byteLength,
    );
    expectAllBuffersWiped(wiped);
  });

  it("wipes an ECDH shared secret when envelope salt generation fails", async () => {
    const producer = new WebCryptoPort();
    const recipient = await producer.generateDeviceVaultKeyPair();
    const vaultMasterKey = await producer.generateVaultMasterKey();
    const sharedSecret = new Uint8Array(32).fill(73).buffer;
    const subtle = new Proxy(globalThis.crypto.subtle, {
      get(target, property, receiver) {
        if (property === "deriveBits") {
          return async () => sharedSecret;
        }
        const value: unknown = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const cryptoApi = withSubtle(subtle);
    Object.defineProperty(cryptoApi, "getRandomValues", {
      value: () => {
        throw new Error("injected random failure");
      },
    });
    bestEffortWipeArrayBuffersSpy.mockClear();

    await expect(
      new WebCryptoPort(cryptoApi).createDeviceVaultKeyEnvelope(
        vaultMasterKey,
        recipient.publicKey,
        {
          vaultId: "vault-id",
          deviceId: "device-id",
          vaultKeyGeneration: 1,
          algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
        },
      ),
    ).rejects.toThrow("injected random failure");

    expect(new Uint8Array(sharedSecret).every((byte) => byte === 0)).toBe(true);
    expect(bestEffortWipeArrayBuffersSpy).toHaveBeenCalledWith([sharedSecret]);
  });

  it("wipes the first ECDH probe when the second key-pair probe rejects", async () => {
    const producer = new WebCryptoPort();
    const pair = await producer.generateDeviceVaultKeyPair();
    const firstProbe = new Uint8Array(32).fill(91).buffer;
    let deriveCallCount = 0;
    const subtle = new Proxy(globalThis.crypto.subtle, {
      get(target, property, receiver) {
        if (property === "deriveBits") {
          return async () => {
            deriveCallCount += 1;
            if (deriveCallCount === 1) {
              return firstProbe;
            }
            throw new Error("injected second ECDH failure");
          };
        }
        const value: unknown = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    bestEffortWipeArrayBuffersSpy.mockClear();

    await expect(
      new WebCryptoPort(withSubtle(subtle)).verifyDeviceVaultKeyPair(
        pair.publicKey,
        pair.privateKey,
      ),
    ).resolves.toBe(false);

    expect(deriveCallCount).toBe(2);
    expect(new Uint8Array(firstProbe).every((byte) => byte === 0)).toBe(true);
    expect(bestEffortWipeArrayBuffersSpy).toHaveBeenCalledWith([
      firstProbe,
      undefined,
    ]);
  });
});

async function createEnrollmentFixture() {
  const producer = new WebCryptoPort();
  const signing = await producer.generateDeviceSignKeyPair();
  const vault = await producer.generateDeviceVaultKeyPair();
  const requestPayload: DeviceEnrollmentRequestPayload = {
    version: 1,
    requestId: "request-id",
    vaultId: "vault-id",
    expectedGenesisCertificateDigest: digest(2),
    deviceId: "device-id",
    algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
    publicSignKey: signing.publicKey,
    publicVaultKey: vault.publicKey,
  };
  const privateState: DeviceEnrollmentPrivateState = {
    request: {
      payload: requestPayload,
      signature: await producer.signDeviceEnrollmentRequest(
        requestPayload,
        signing.privateKey,
      ),
    },
    devicePrivateSignKey: signing.privateKey,
    devicePrivateVaultKey: vault.privateKey,
    deviceLocalProtectionKey: await producer.generateDeviceLocalProtectionKey(),
  };
  const protectionKey =
    await producer.deriveDeviceEnrollmentPrivateStateProtectionKey(
      await producer.deriveLocalRootKey(
        "master-password" as RawMasterPassword,
        await producer.generateMasterPasswordSalt(),
      ),
      await producer.generateLocalKeysProtectionSalt(),
    );

  return {
    privateState,
    protectionKey,
    wrapped: await producer.wrapDeviceEnrollmentPrivateState(
      privateState,
      protectionKey,
    ),
  };
}

function withSubtle(subtle: SubtleCrypto): Crypto {
  const cryptoApi = Object.create(globalThis.crypto) as Crypto;
  Object.defineProperty(cryptoApi, "subtle", { value: subtle });
  return cryptoApi;
}

function algorithmName(algorithm: AlgorithmIdentifier): string {
  return typeof algorithm === "string" ? algorithm : algorithm.name;
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error("Deferred promise was not initialized.");
  };
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function fakeCryptoKey(): CryptoKey {
  return {} as CryptoKey;
}

async function nextMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function expectAllBuffersWiped(
  buffers: readonly (ArrayBuffer | undefined)[],
): void {
  for (const buffer of buffers) {
    expect(buffer).toBeDefined();
    expect(new Uint8Array(buffer!).every((byte) => byte === 0)).toBe(true);
  }
}

function digest(seed: number): string {
  return encodeBase64Url(new Uint8Array(32).fill(seed));
}
