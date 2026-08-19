import { describe, expect, it } from "vitest";
import type {
  DeviceAccessMaterial,
  DeviceAccessRecoveryBackup,
  DevicePublicSignKey,
  DeviceVaultPublicKey,
  LocalVaultTrustCheckpoint,
  RandomBytes,
} from "@lfspm/core";
import { encodeBase64Url } from "@lfspm/core/lib";
import {
  InvalidLocalVaultSecurityRecordError,
  decodeDeviceAccessMaterial,
  decodeDeviceAccessRecoveryBackup,
  decodeLocalVaultTrustCheckpoint,
  encodeDeviceAccessMaterial,
  encodeDeviceAccessRecoveryBackup,
  encodeLocalVaultTrustCheckpoint,
} from "../codecs/local-vault-security.codec";

describe("vault security-record codecs", () => {
  it("exactly round-trips device access material", () => {
    const material = createDeviceAccessMaterial();
    const encoded = encodeDeviceAccessMaterial(material);

    expect(encoded).toEqual({
      revision: 1,
      localAccessGenerationId: "generation-1",
      vaultId: "vault-id",
      deviceId: "device-id",
      algorithmSuiteId: "spm-v1",
      masterPasswordSalt: encodedBytes(32, 1),
      localKeysProtectionSalt: encodedBytes(32, 2),
      devicePublicSignKey: encodedBytes(32, 3),
      devicePublicVaultKey: encodedBytes(65, 4),
      protectedLocalKeys: {
        wrappedKey: encodedBytes(48, 5),
        wrappingNonce: encodedBytes(12, 6),
      },
    });
    expect(decodeDeviceAccessMaterial(encoded)).toEqual(material);
  });

  it("exactly round-trips the recovery backup", () => {
    const backup = createRecoveryBackup();
    const encoded = encodeDeviceAccessRecoveryBackup(backup);

    expect(encoded).toEqual({
      revision: 1,
      localAccessGenerationId: "generation-1",
      vaultId: "vault-id",
      deviceId: "device-id",
      algorithmSuiteId: "spm-v1",
      recoveryLocalKeysProtectionSalt: encodedBytes(32, 7),
      devicePublicSignKey: encodedBytes(32, 3),
      devicePublicVaultKey: encodedBytes(65, 4),
      protectedLocalKeys: {
        wrappedKey: encodedBytes(48, 8),
        wrappingNonce: encodedBytes(12, 9),
      },
    });
    expect(decodeDeviceAccessRecoveryBackup(encoded)).toEqual(backup);
  });

  it("exactly round-trips the signed checkpoint", () => {
    const checkpoint = createCheckpoint();
    const encoded = encodeLocalVaultTrustCheckpoint(checkpoint);

    expect(encoded).toEqual({
      payload: {
        version: 1,
        vaultId: "vault-id",
        deviceId: "device-id",
        trustGeneration: 0,
        trustCertificateDigest: encodedBytes(32, 10),
        vaultKeyGeneration: 1,
        snapshotVersionVector: { "device-id": 2 },
        snapshotDigest: encodedBytes(32, 11),
      },
      signature: { signature: encodedBytes(64, 12) },
    });
    expect(decodeLocalVaultTrustCheckpoint(encoded)).toEqual(checkpoint);
  });

  it.each([
    {
      family: "device access material",
      decode: decodeDeviceAccessMaterial,
      valid: () =>
        asRecord(encodeDeviceAccessMaterial(createDeviceAccessMaterial())),
      missingField: "masterPasswordSalt",
      wrongField: "revision",
    },
    {
      family: "recovery backup",
      decode: decodeDeviceAccessRecoveryBackup,
      valid: () =>
        asRecord(encodeDeviceAccessRecoveryBackup(createRecoveryBackup())),
      missingField: "recoveryLocalKeysProtectionSalt",
      wrongField: "revision",
    },
    {
      family: "checkpoint",
      decode: decodeLocalVaultTrustCheckpoint,
      valid: () =>
        asRecord(encodeLocalVaultTrustCheckpoint(createCheckpoint())),
      missingField: "signature",
      wrongField: "payload",
    },
  ])(
    "rejects missing, wrong-typed, and extra fields for $family",
    ({ decode, valid, missingField, wrongField }) => {
      expectStaticSecurityError(() =>
        decode(withoutField(valid(), missingField)),
      );
      expectStaticSecurityError(() =>
        decode({ ...valid(), [wrongField]: "wrong-type" }),
      );
      expectStaticSecurityError(() =>
        decode({ ...valid(), futureField: true }),
      );
    },
  );

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects device-access revision %s",
    (revision) => {
      const encoded = asRecord(
        encodeDeviceAccessMaterial(createDeviceAccessMaterial()),
      );
      expectStaticSecurityError(() =>
        decodeDeviceAccessMaterial({ ...encoded, revision }),
      );
    },
  );

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects recovery revision %s",
    (revision) => {
      const encoded = asRecord(
        encodeDeviceAccessRecoveryBackup(createRecoveryBackup()),
      );
      expectStaticSecurityError(() =>
        decodeDeviceAccessRecoveryBackup({ ...encoded, revision }),
      );
    },
  );

  it.each(["", "   "])(
    "rejects blank local access generation %j",
    (localAccessGenerationId) => {
      const material = asRecord(
        encodeDeviceAccessMaterial(createDeviceAccessMaterial()),
      );
      const backup = asRecord(
        encodeDeviceAccessRecoveryBackup(createRecoveryBackup()),
      );

      expectStaticSecurityError(() =>
        decodeDeviceAccessMaterial({ ...material, localAccessGenerationId }),
      );
      expectStaticSecurityError(() =>
        decodeDeviceAccessRecoveryBackup({
          ...backup,
          localAccessGenerationId,
        }),
      );
    },
  );

  it.each([
    ["padded", `${encodedBytes(32, 1)}=`],
    ["short", encodedBytes(31, 1)],
    ["malformed", "not+base64url"],
  ])("rejects %s access and recovery salts", (_name, salt) => {
    const material = asRecord(
      encodeDeviceAccessMaterial(createDeviceAccessMaterial()),
    );
    const backup = asRecord(
      encodeDeviceAccessRecoveryBackup(createRecoveryBackup()),
    );

    expectStaticSecurityError(() =>
      decodeDeviceAccessMaterial({ ...material, masterPasswordSalt: salt }),
    );
    expectStaticSecurityError(() =>
      decodeDeviceAccessRecoveryBackup({
        ...backup,
        recoveryLocalKeysProtectionSalt: salt,
      }),
    );
  });

  it("rejects a wrapped local-key ciphertext shorter than its authentication tag", () => {
    const material = asRecord(
      encodeDeviceAccessMaterial(createDeviceAccessMaterial()),
    );
    const backup = asRecord(
      encodeDeviceAccessRecoveryBackup(createRecoveryBackup()),
    );
    const shortWrapped = {
      wrappedKey: encodedBytes(15, 20),
      wrappingNonce: encodedBytes(12, 21),
    };

    expectStaticSecurityError(() =>
      decodeDeviceAccessMaterial({
        ...material,
        protectedLocalKeys: shortWrapped,
      }),
    );
    expectStaticSecurityError(() =>
      decodeDeviceAccessRecoveryBackup({
        ...backup,
        protectedLocalKeys: shortWrapped,
      }),
    );
  });

  it.each([0, 2])("rejects checkpoint version %s", (version) => {
    const encoded = asRecord(
      encodeLocalVaultTrustCheckpoint(createCheckpoint()),
    );
    const payload = asRecord(encoded.payload);
    expectStaticSecurityError(() =>
      decodeLocalVaultTrustCheckpoint({
        ...encoded,
        payload: { ...payload, version },
      }),
    );
  });

  it.each([
    ["trustGeneration", -1],
    ["trustGeneration", 1.5],
    ["trustGeneration", Number.MAX_SAFE_INTEGER + 1],
    ["vaultKeyGeneration", 0],
    ["vaultKeyGeneration", 1.5],
  ])("rejects checkpoint %s value %s", (field, value) => {
    const encoded = asRecord(
      encodeLocalVaultTrustCheckpoint(createCheckpoint()),
    );
    const payload = asRecord(encoded.payload);
    expectStaticSecurityError(() =>
      decodeLocalVaultTrustCheckpoint({
        ...encoded,
        payload: { ...payload, [field]: value },
      }),
    );
  });

  it("rejects negative and fractional checkpoint vector counters", () => {
    const encoded = asRecord(
      encodeLocalVaultTrustCheckpoint(createCheckpoint()),
    );
    const payload = asRecord(encoded.payload);

    for (const counter of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expectStaticSecurityError(() =>
        decodeLocalVaultTrustCheckpoint({
          ...encoded,
          payload: {
            ...payload,
            snapshotVersionVector: { "device-id": counter },
          },
        }),
      );
    }
  });

  it.each([
    ["padded", `${encodedBytes(32, 10)}=`],
    ["short", encodedBytes(31, 10)],
    ["malformed", "not+base64url"],
  ])("rejects %s checkpoint digests", (_name, digest) => {
    const encoded = asRecord(
      encodeLocalVaultTrustCheckpoint(createCheckpoint()),
    );
    const payload = asRecord(encoded.payload);

    for (const field of ["trustCertificateDigest", "snapshotDigest"]) {
      expectStaticSecurityError(() =>
        decodeLocalVaultTrustCheckpoint({
          ...encoded,
          payload: { ...payload, [field]: digest },
        }),
      );
    }
  });

  it("rejects checkpoint payload extras and malformed signatures", () => {
    const encoded = asRecord(
      encodeLocalVaultTrustCheckpoint(createCheckpoint()),
    );
    const payload = asRecord(encoded.payload);

    expectStaticSecurityError(() =>
      decodeLocalVaultTrustCheckpoint({
        ...encoded,
        payload: { ...payload, futureField: true },
      }),
    );
    expectStaticSecurityError(() =>
      decodeLocalVaultTrustCheckpoint({
        ...encoded,
        signature: { signature: encodedBytes(63, 12) },
      }),
    );
    expectStaticSecurityError(() =>
      decodeLocalVaultTrustCheckpoint({
        ...encoded,
        signature: {
          signature: `${encodedBytes(64, 12)}=`,
        },
      }),
    );
  });
});

function createDeviceAccessMaterial(): DeviceAccessMaterial {
  return {
    revision: 1,
    localAccessGenerationId: "generation-1",
    vaultId: "vault-id",
    deviceId: "device-id",
    algorithmSuiteId: "spm-v1",
    masterPasswordSalt: bytes(32, 1) as RandomBytes,
    localKeysProtectionSalt: bytes(32, 2) as RandomBytes,
    devicePublicSignKey: bytes(32, 3) as DevicePublicSignKey,
    devicePublicVaultKey: bytes(65, 4) as DeviceVaultPublicKey,
    protectedLocalKeys: {
      wrappedKey: encodedBytes(48, 5),
      wrappingNonce: encodedBytes(12, 6),
    },
  };
}

function createRecoveryBackup(): DeviceAccessRecoveryBackup {
  return {
    revision: 1,
    localAccessGenerationId: "generation-1",
    vaultId: "vault-id",
    deviceId: "device-id",
    algorithmSuiteId: "spm-v1",
    recoveryLocalKeysProtectionSalt: bytes(32, 7) as RandomBytes,
    devicePublicSignKey: bytes(32, 3) as DevicePublicSignKey,
    devicePublicVaultKey: bytes(65, 4) as DeviceVaultPublicKey,
    protectedLocalKeys: {
      wrappedKey: encodedBytes(48, 8),
      wrappingNonce: encodedBytes(12, 9),
    },
  };
}

function createCheckpoint(): LocalVaultTrustCheckpoint {
  return {
    payload: {
      version: 1,
      vaultId: "vault-id",
      deviceId: "device-id",
      trustGeneration: 0,
      trustCertificateDigest: encodedBytes(32, 10),
      vaultKeyGeneration: 1,
      snapshotVersionVector: { "device-id": 2 },
      snapshotDigest: encodedBytes(32, 11),
    },
    signature: { signature: encodedBytes(64, 12) },
  };
}

function bytes(length: number, seed: number): ArrayBuffer {
  return Uint8Array.from({ length }, (_, index) => (seed + index) % 256).buffer;
}

function encodedBytes(length: number, seed: number) {
  return encodeBase64Url(new Uint8Array(bytes(length, seed)));
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected a record fixture.");
  }
  return value as Record<string, unknown>;
}

function withoutField(
  record: Record<string, unknown>,
  omittedField: string,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([field]) => field !== omittedField),
  );
}

function expectStaticSecurityError(operation: () => unknown): void {
  let caught: unknown;

  try {
    operation();
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(InvalidLocalVaultSecurityRecordError);
  expect(caught).toMatchObject({
    name: "InvalidLocalVaultSecurityRecordError",
    message: "Local vault security record is malformed.",
  });
  expect(caught).not.toHaveProperty("cause");
}
