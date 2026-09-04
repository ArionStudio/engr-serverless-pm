import { describe, expect, it } from "vitest";
import { canonicalize } from "json-canonicalize";
import {
  CURRENT_ALGORITHM_SUITE,
  type DeviceEnrollmentPrivateState,
  type DeviceEnrollmentPrivateStateProtectionKey,
  type DeviceEnrollmentRequestPayload,
  type DevicePublicSignKey,
  type DeviceVaultPublicKey,
  type LocalKeysPayload,
  type LocalRootKey,
  type LocalVaultTrustCheckpointPayload,
  type RandomBytes,
  type RawMasterPassword,
  type RecoverySecretKey,
  type SerializedEncrypted,
  type SerializedWrapped,
  type SyncTarget,
  type Vault,
  type VaultMasterKey,
  type VaultSnapshot,
  type VaultTrustCertificatePayload,
} from "@lfspm/core";
import { decodeBase64Url, encodeBase64Url } from "@lfspm/core/lib";
import {
  InvalidDeviceEnrollmentPrivateStateError,
  InvalidDeviceSyncCredentialStateError,
  InvalidOpenedVaultMasterKeyError,
  InvalidUnlockedVaultSessionPayloadError,
  InvalidVaultSnapshotPayloadError,
} from "./index";
import { WebCryptoAdapter } from "./web-crypto.adapter";

const encoder = new TextEncoder();

function artifactDigest(seed: number): string {
  return encodeBase64Url(new Uint8Array(32).fill(seed));
}

describe("WebCryptoAdapter", () => {
  it("implements the declared suite and returns fresh correctly sized random material", async () => {
    const crypto = new WebCryptoAdapter();

    expect(crypto.algorithmSuite).toBe(CURRENT_ALGORITHM_SUITE);
    const largeRandom = await crypto.generateRandomBytes(65_537);
    const localKey = await crypto.generateDeviceLocalProtectionKey();
    const vaultKey = await crypto.generateVaultMasterKey();
    const recoveryKey = await crypto.generateRecoveryKey();
    const sessionKey = await crypto.generateUnlockedVaultSessionPayloadKey();
    const salts = await Promise.all([
      crypto.generateMasterPasswordSalt(),
      crypto.generateLocalKeysProtectionSalt(),
      crypto.generateRecoveryLocalKeysProtectionSalt(),
    ]);

    expect(largeRandom.byteLength).toBe(65_537);
    expect(localKey.byteLength).toBe(32);
    expect(vaultKey.byteLength).toBe(32);
    expect(recoveryKey.byteLength).toBe(32);
    expect(sessionKey.byteLength).toBe(32);
    expect(salts.map((salt) => salt.byteLength)).toEqual([32, 32, 32]);
    expect(localKey).not.toBe(vaultKey);
    await expect(crypto.generateRandomBytes(-1)).rejects.toBeInstanceOf(
      RangeError,
    );
  });

  it("pins the spm-v1 domain-separation inputs", async () => {
    const hkdfInfo: string[] = [];
    const envelopeHkdfInfo: string[] = [];
    const authenticatedData: string[] = [];
    const nonceLengths: number[] = [];
    const tagLengths: number[] = [];
    const subtle = new Proxy(globalThis.crypto.subtle, {
      get(target, property, receiver) {
        if (property === "deriveBits") {
          return async (...args: Parameters<SubtleCrypto["deriveBits"]>) => {
            const [algorithm] = args;
            if (typeof algorithm !== "string" && algorithm.name === "HKDF") {
              hkdfInfo.push(decodeUtf8((algorithm as HkdfParams).info));
            }
            return target.deriveBits(...args);
          };
        }
        if (property === "encrypt") {
          return async (...args: Parameters<SubtleCrypto["encrypt"]>) => {
            const [algorithm] = args;
            if (typeof algorithm !== "string" && algorithm.name === "AES-GCM") {
              const parameters = algorithm as AesGcmParams;
              if (parameters.additionalData !== undefined) {
                authenticatedData.push(decodeUtf8(parameters.additionalData));
              }
              nonceLengths.push(parameters.iv.byteLength);
              tagLengths.push(parameters.tagLength ?? 128);
            }
            return target.encrypt(...args);
          };
        }
        if (property === "deriveKey") {
          return async (...args: Parameters<SubtleCrypto["deriveKey"]>) => {
            const [algorithm] = args;
            if (typeof algorithm !== "string" && algorithm.name === "HKDF") {
              envelopeHkdfInfo.push(decodeUtf8((algorithm as HkdfParams).info));
            }
            return target.deriveKey(...args);
          };
        }
        const value: unknown = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const cryptoApi = Object.create(globalThis.crypto) as Crypto;
    Object.defineProperty(cryptoApi, "subtle", { value: subtle });
    Object.defineProperty(cryptoApi, "getRandomValues", {
      value: globalThis.crypto.getRandomValues.bind(globalThis.crypto),
    });
    const crypto = new WebCryptoAdapter(cryptoApi);
    const rootBytes = Uint8Array.from({ length: 32 }, (_, index) => index);
    const saltBytes = new Uint8Array(32).fill(0xa5);
    const localRootKey = rootBytes.buffer as LocalRootKey;
    const recoveryKey = rootBytes.slice().buffer as RecoverySecretKey;
    const salt = saltBytes.buffer as RandomBytes;

    const localProtection = await crypto.deriveLocalKeysProtectionKey(
      localRootKey,
      salt,
    );
    const recoveryProtection =
      await crypto.deriveRecoveryLocalKeysProtectionKey(recoveryKey, salt);
    const enrollmentProtection =
      await crypto.deriveDeviceEnrollmentPrivateStateProtectionKey(
        localRootKey,
        salt,
      );

    expect(
      [localProtection, recoveryProtection, enrollmentProtection].map((key) =>
        encodeBase64Url(new Uint8Array(key)),
      ),
    ).toEqual([
      "89_Iz8bcigPMmX-ZpGD8wV0Kslenupp8tYZ6wuk-Rzc",
      "EDfPV9xgzaCR62nJy1ySNztj_jckZXytwXusNoanppo",
      "iciGp_pumk5PK_OdVJIx0yffORcdNbbCao27MuMhzwI",
    ]);

    const signing = await crypto.generateDeviceSignKeyPair();
    const vaultKeys = await crypto.generateDeviceVaultKeyPair();
    const deviceLocalProtectionKey =
      await crypto.generateDeviceLocalProtectionKey();
    await crypto.createDeviceVaultKeyEnvelope(
      await crypto.generateVaultMasterKey(),
      vaultKeys.publicKey,
      {
        vaultId: "vault-id",
        deviceId: "device-id",
        vaultKeyGeneration: 1,
        algorithmSuiteId: "spm-v1",
      },
    );
    const localPayload: LocalKeysPayload = {
      devicePrivateSignKey: signing.privateKey,
      devicePrivateVaultKey: vaultKeys.privateKey,
      deviceLocalProtectionKey,
      vaultTrustAnchor: {
        version: 1,
        vaultId: "vault-id",
        genesisDeviceId: "device-id",
        genesisPublicSignKey: signing.publicKey,
        genesisCertificateDigest: artifactDigest(1),
      },
    };
    await crypto.wrapLocalKeysPayload(localPayload, localProtection);

    const requestPayload: DeviceEnrollmentRequestPayload = {
      version: 1,
      requestId: "request-id",
      vaultId: "vault-id",
      expectedGenesisCertificateDigest: artifactDigest(1),
      deviceId: "device-id",
      algorithmSuiteId: "spm-v1",
      publicSignKey: signing.publicKey,
      publicVaultKey: vaultKeys.publicKey,
    };
    await crypto.wrapDeviceEnrollmentPrivateState(
      {
        request: {
          payload: requestPayload,
          signature: await crypto.signDeviceEnrollmentRequest(
            requestPayload,
            signing.privateKey,
          ),
        },
        devicePrivateSignKey: signing.privateKey,
        devicePrivateVaultKey: vaultKeys.privateKey,
        deviceLocalProtectionKey,
      },
      enrollmentProtection,
    );

    const vault = createVault();
    await crypto.encryptVaultSnapshotContent(
      vault,
      await crypto.generateVaultMasterKey(),
    );
    await crypto.encryptUnlockedVaultSessionPayload(
      { vault },
      await crypto.generateUnlockedVaultSessionPayloadKey(),
      {
        sessionId: "session-id",
        vaultId: "vault-id",
        sourceSnapshotVersionVector: { "device-id": 1 },
      },
    );
    await crypto.encryptDeviceSyncCredentialState(
      {
        currentCredentials: {
          provider: "aws-s3-v1",
          credentialsConfig: {
            accessKeyId: "access-key",
            secretAccessKey: "secret-key",
          },
        },
      },
      deviceLocalProtectionKey,
      {
        vaultId: "vault-id",
        deviceId: "device-id",
        provider: "aws-s3-v1",
        target: {
          provider: "aws-s3-v1",
          targetConfig: {
            bucket: "bucket",
            prefix: "vault/",
            region: "eu-west-1",
          },
        },
      },
    );

    expect(hkdfInfo).toEqual([
      '{"purpose":"lfspm-local-keys-protection-v1"}',
      '{"purpose":"lfspm-recovery-local-keys-protection-v1"}',
      '{"purpose":"lfspm-device-enrollment-private-state-protection-v1"}',
    ]);
    expect(envelopeHkdfInfo).toEqual([
      '{"context":{"algorithmSuiteId":"spm-v1","deviceId":"device-id","vaultId":"vault-id","vaultKeyGeneration":1},"purpose":"lfspm-vault-key-envelope-v1"}',
    ]);
    expect(authenticatedData).toEqual([
      '{"algorithmSuiteId":"spm-v1","deviceId":"device-id","vaultId":"vault-id","vaultKeyGeneration":1}',
      '{"purpose":"lfspm-local-keys-payload-v1"}',
      '{"purpose":"lfspm-device-enrollment-private-state-v1"}',
      '{"purpose":"lfspm-vault-snapshot-content-v1"}',
      '{"context":{"sessionId":"session-id","sourceSnapshotVersionVector":{"device-id":1},"vaultId":"vault-id"},"purpose":"lfspm-unlocked-vault-session-payload-v1"}',
      '{"context":{"deviceId":"device-id","provider":"aws-s3-v1","target":{"provider":"aws-s3-v1","targetConfig":{"bucket":"bucket","prefix":"vault/","region":"eu-west-1"}},"vaultId":"vault-id"},"purpose":"lfspm-device-sync-credential-state-v1"}',
    ]);
    expect(nonceLengths).toEqual([12, 12, 12, 12, 12, 12]);
    expect(tagLengths).toEqual([128, 128, 128, 128, 128, 128]);
  });

  it("generates importable signing and vault key pairs and rejects mismatches", async () => {
    const crypto = new WebCryptoAdapter();
    const signing = await crypto.generateDeviceSignKeyPair();
    const otherSigning = await crypto.generateDeviceSignKeyPair();
    const vault = await crypto.generateDeviceVaultKeyPair();
    const otherVault = await crypto.generateDeviceVaultKeyPair();

    expect(signing.publicKey.byteLength).toBe(
      CURRENT_ALGORITHM_SUITE.signing.publicKeyLengthBytes,
    );
    expect(signing.privateKey.byteLength).toBe(
      CURRENT_ALGORITHM_SUITE.signing.privateKeyLengthBytes,
    );
    expect(vault.publicKey.byteLength).toBe(
      CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.publicKeyLengthBytes,
    );
    expect(vault.privateKey.byteLength).toBe(
      CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.privateKeyLengthBytes,
    );

    await expect(
      crypto.verifyDeviceSignKeyPair(signing.publicKey, signing.privateKey),
    ).resolves.toBe(true);
    await expect(
      crypto.verifyDeviceSignKeyPair(
        signing.publicKey,
        otherSigning.privateKey,
      ),
    ).resolves.toBe(false);
    await expect(
      crypto.verifyDeviceVaultKeyPair(vault.publicKey, vault.privateKey),
    ).resolves.toBe(true);
    await expect(
      crypto.verifyDeviceVaultKeyPair(vault.publicKey, otherVault.privateKey),
    ).resolves.toBe(false);
    await expect(
      crypto.verifyDeviceSignKeyPair(
        signing.publicKey,
        new Uint8Array(signing.privateKey.byteLength)
          .buffer as typeof signing.privateKey,
      ),
    ).resolves.toBe(false);
    await expect(
      crypto.verifyDeviceVaultKeyPair(
        vault.publicKey,
        new Uint8Array(vault.privateKey.byteLength)
          .buffer as typeof vault.privateKey,
      ),
    ).resolves.toBe(false);
    await expect(
      crypto.digestDevicePublicVaultKey(
        new Uint8Array(65).buffer as DeviceVaultPublicKey,
      ),
    ).rejects.toThrow();
    await expect(
      crypto.digestDevicePublicSignKey(
        new Uint8Array(31).buffer as DevicePublicSignKey,
      ),
    ).rejects.toBeInstanceOf(RangeError);
  });

  it("derives stable purpose-separated protection keys", async () => {
    const crypto = new WebCryptoAdapter();
    const salt = await crypto.generateMasterPasswordSalt();
    const root = await crypto.deriveLocalRootKey(
      "correct horse battery staple" as RawMasterPassword,
      salt,
    );
    const repeatedRoot = await crypto.deriveLocalRootKey(
      "correct horse battery staple" as RawMasterPassword,
      salt,
    );
    const local = await crypto.deriveLocalKeysProtectionKey(root, salt);
    const enrollment =
      await crypto.deriveDeviceEnrollmentPrivateStateProtectionKey(root, salt);
    const recovery = await crypto.deriveRecoveryLocalKeysProtectionKey(
      await crypto.generateRecoveryKey(),
      salt,
    );

    expect(bytes(root)).toEqual(bytes(repeatedRoot));
    expect(root).not.toBe(repeatedRoot);
    expect(local.byteLength).toBe(32);
    expect(enrollment.byteLength).toBe(32);
    expect(recovery.byteLength).toBe(32);
    expect(bytes(local)).not.toEqual(bytes(enrollment));
  });

  it("wraps and unwraps local keys and enrollment private state", async () => {
    const crypto = new WebCryptoAdapter();
    const signing = await crypto.generateDeviceSignKeyPair();
    const vaultKeys = await crypto.generateDeviceVaultKeyPair();
    const localProtection = await crypto.generateDeviceLocalProtectionKey();
    const root = await crypto.deriveLocalRootKey(
      "master-password" as RawMasterPassword,
      await crypto.generateMasterPasswordSalt(),
    );
    const salt = await crypto.generateLocalKeysProtectionSalt();
    const protection = await crypto.deriveLocalKeysProtectionKey(root, salt);
    const anchor = {
      version: 1 as const,
      vaultId: "vault-id",
      genesisDeviceId: "device-id",
      genesisPublicSignKey: signing.publicKey,
      genesisCertificateDigest: artifactDigest(1),
    };
    const localPayload: LocalKeysPayload = {
      devicePrivateSignKey: signing.privateKey,
      devicePrivateVaultKey: vaultKeys.privateKey,
      deviceLocalProtectionKey: localProtection,
      vaultTrustAnchor: anchor,
    };
    const wrapped = await crypto.wrapLocalKeysPayload(localPayload, protection);

    await expect(
      crypto.unwrapLocalKeysPayload(wrapped, protection),
    ).resolves.toEqual(localPayload);

    const requestPayload: DeviceEnrollmentRequestPayload = {
      version: 1,
      requestId: "request-id",
      vaultId: "vault-id",
      expectedGenesisCertificateDigest: artifactDigest(1),
      deviceId: "device-id",
      algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
      publicSignKey: signing.publicKey,
      publicVaultKey: vaultKeys.publicKey,
    };
    const privateState: DeviceEnrollmentPrivateState = {
      request: {
        payload: requestPayload,
        signature: await crypto.signDeviceEnrollmentRequest(
          requestPayload,
          signing.privateKey,
        ),
      },
      devicePrivateSignKey: signing.privateKey,
      devicePrivateVaultKey: vaultKeys.privateKey,
      deviceLocalProtectionKey: localProtection,
    };
    const enrollmentProtection =
      await crypto.deriveDeviceEnrollmentPrivateStateProtectionKey(root, salt);
    const protectedState = await crypto.wrapDeviceEnrollmentPrivateState(
      privateState,
      enrollmentProtection,
    );

    await expect(
      crypto.unwrapDeviceEnrollmentPrivateState(
        protectedState,
        enrollmentProtection,
      ),
    ).resolves.toEqual(privateState);
    await expect(
      crypto.unwrapDeviceEnrollmentPrivateState(
        protectedState,
        (await crypto.generateDeviceLocalProtectionKey()) as unknown as DeviceEnrollmentPrivateStateProtectionKey,
      ),
    ).rejects.toThrow();
  });

  it("rejects authenticated hostile enrollment private-state shapes with the exact static error", async () => {
    const fixture = await createEnrollmentPrivateStateFixture();
    const request = fixture.encoded.request;
    const payload = request.payload;
    const hostileStates: readonly unknown[] = [
      { ...fixture.encoded, unexpected: true },
      {
        ...fixture.encoded,
        request: { ...request, unexpected: true },
      },
      {
        ...fixture.encoded,
        request: { ...request, payload: { ...payload, version: 2 } },
      },
      {
        ...fixture.encoded,
        request: { ...request, payload: { ...payload, requestId: "" } },
      },
      {
        ...fixture.encoded,
        request: {
          ...request,
          payload: {
            ...payload,
            publicSignKey: `${payload.publicSignKey}=`,
          },
        },
      },
      {
        ...fixture.encoded,
        request: {
          ...request,
          signature: {
            signature: encodeBase64Url(new Uint8Array(63)),
          },
        },
      },
      {
        ...fixture.encoded,
        deviceLocalProtectionKey: `${fixture.encoded.deviceLocalProtectionKey}=`,
      },
      {
        ...fixture.encoded,
        devicePrivateSignKey: encodeBase64Url(
          new Uint8Array(
            CURRENT_ALGORITHM_SUITE.signing.privateKeyLengthBytes - 1,
          ),
        ),
      },
      {
        ...fixture.encoded,
        devicePrivateVaultKey: encodeBase64Url(
          new Uint8Array(
            CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.privateKeyLengthBytes + 1,
          ),
        ),
      },
    ];

    for (const hostileState of hostileStates) {
      const wrapped = await encryptEnrollmentPrivateState(
        fixture.protectionKey,
        hostileState,
      );
      let thrown: unknown;
      try {
        await fixture.crypto.unwrapDeviceEnrollmentPrivateState(
          wrapped,
          fixture.protectionKey,
        );
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(InvalidDeviceEnrollmentPrivateStateError);
      expect(thrown).toMatchObject({
        name: "InvalidDeviceEnrollmentPrivateStateError",
        message: "Device enrollment private state is malformed.",
      });
      expect(Object.hasOwn(thrown as object, "cause")).toBe(false);
    }
  });

  it.each(["devicePrivateSignKey", "devicePrivateVaultKey"] as const)(
    "rejects a same-length corrupted PKCS8 %s after authenticated unwrap",
    async (field) => {
      const fixture = await createEnrollmentPrivateStateFixture();
      const original = fixture.encoded[field];
      const originalBytes = decodeBase64Url(original);
      const corrupted = new Uint8Array(originalBytes);
      corrupted[0] = corrupted[0] === 0 ? 1 : 0;
      const wrapped = await encryptEnrollmentPrivateState(
        fixture.protectionKey,
        {
          ...fixture.encoded,
          [field]: encodeBase64Url(corrupted),
        },
      );

      let thrown: unknown;
      try {
        await fixture.crypto.unwrapDeviceEnrollmentPrivateState(
          wrapped,
          fixture.protectionKey,
        );
      } catch (error) {
        thrown = error;
      }

      expect(corrupted.byteLength).toBe(originalBytes.byteLength);
      expect(thrown).toBeInstanceOf(InvalidDeviceEnrollmentPrivateStateError);
      expect(Object.hasOwn(thrown as object, "cause")).toBe(false);
    },
  );

  it("round-trips a recipient envelope and authenticates its full context", async () => {
    const crypto = new WebCryptoAdapter();
    const recipient = await crypto.generateDeviceVaultKeyPair();
    const masterKey = await crypto.generateVaultMasterKey();
    const context = {
      vaultId: "vault-id",
      deviceId: "device-id",
      vaultKeyGeneration: 3,
      algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
    };
    const envelope = await crypto.createDeviceVaultKeyEnvelope(
      masterKey,
      recipient.publicKey,
      context,
    );

    const opened = await crypto.openDeviceVaultKeyEnvelope(
      envelope,
      recipient.privateKey,
      context,
    );
    expect(bytes(opened)).toEqual(bytes(masterKey));
    expect(opened).not.toBe(masterKey);

    const contextWithRuntimeExtra = {
      ...context,
      undeclaredContext: "ignored",
    };
    const envelopeWithRuntimeExtra = await crypto.createDeviceVaultKeyEnvelope(
      masterKey,
      recipient.publicKey,
      contextWithRuntimeExtra,
    );
    await expect(
      crypto.openDeviceVaultKeyEnvelope(
        envelopeWithRuntimeExtra,
        recipient.privateKey,
        context,
      ),
    ).resolves.toEqual(masterKey);

    await expect(
      crypto.openDeviceVaultKeyEnvelope(envelope, recipient.privateKey, {
        ...context,
        vaultId: "other-vault-id",
      }),
    ).rejects.toBeInstanceOf(InvalidOpenedVaultMasterKeyError);
    await expect(
      crypto.createDeviceVaultKeyEnvelope(
        new Uint8Array(31).buffer as VaultMasterKey,
        recipient.publicKey,
        context,
      ),
    ).rejects.toBeInstanceOf(RangeError);
  });

  it("keeps the ephemeral ECDH private key non-extractable", async () => {
    const producer = new WebCryptoAdapter();
    const recipient = await producer.generateDeviceVaultKeyPair();
    const requestedExtractability: boolean[] = [];
    const subtle = new Proxy(globalThis.crypto.subtle, {
      get(target, property, receiver) {
        if (property === "generateKey") {
          return async (
            algorithm: AlgorithmIdentifier,
            extractable: boolean,
            keyUsages: readonly KeyUsage[],
          ) => {
            requestedExtractability.push(extractable);
            return target.generateKey(algorithm, extractable, keyUsages);
          };
        }
        const value: unknown = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const cryptoApi = Object.create(globalThis.crypto) as Crypto;
    Object.defineProperty(cryptoApi, "subtle", { value: subtle });
    Object.defineProperty(cryptoApi, "getRandomValues", {
      value: globalThis.crypto.getRandomValues.bind(globalThis.crypto),
    });
    const crypto = new WebCryptoAdapter(cryptoApi);

    await crypto.createDeviceVaultKeyEnvelope(
      await producer.generateVaultMasterKey(),
      recipient.publicKey,
      {
        vaultId: "vault-id",
        deviceId: "device-id",
        vaultKeyGeneration: 1,
        algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
      },
    );

    expect(requestedExtractability).toEqual([false]);
  });

  it("encrypts vault, session, and credential payloads with context binding", async () => {
    const crypto = new WebCryptoAdapter();
    const vault = createVault();
    const vaultKey = await crypto.generateVaultMasterKey();
    const encryptedVault = await crypto.encryptVaultSnapshotContent(
      vault,
      vaultKey,
    );
    await expect(
      crypto.decryptVaultSnapshotContent(encryptedVault, vaultKey),
    ).resolves.toEqual(vault);

    const sessionKey = await crypto.generateUnlockedVaultSessionPayloadKey();
    const sessionContext = {
      sessionId: "session-id",
      vaultId: "vault-id",
      sourceSnapshotVersionVector: { "device-id": 1 },
    };
    const encryptedSession = await crypto.encryptUnlockedVaultSessionPayload(
      { vault },
      sessionKey,
      sessionContext,
    );
    const sessionContextWithRuntimeExtra = {
      ...sessionContext,
      undeclaredContext: "ignored",
    };
    const encryptedSessionWithRuntimeExtra =
      await crypto.encryptUnlockedVaultSessionPayload(
        { vault },
        sessionKey,
        sessionContextWithRuntimeExtra,
      );
    await expect(
      crypto.decryptUnlockedVaultSessionPayload(
        encryptedSessionWithRuntimeExtra,
        sessionKey,
        sessionContext,
      ),
    ).resolves.toEqual({ vault });
    await expect(
      crypto.decryptUnlockedVaultSessionPayload(
        encryptedSession,
        sessionKey,
        sessionContextWithRuntimeExtra,
      ),
    ).resolves.toEqual({ vault });
    await expect(
      crypto.decryptUnlockedVaultSessionPayload(encryptedSession, sessionKey, {
        ...sessionContext,
        sessionId: "replacement-session-id",
      }),
    ).rejects.toBeInstanceOf(InvalidUnlockedVaultSessionPayloadError);

    const syncKey = await crypto.generateDeviceLocalProtectionKey();
    const target: SyncTarget = {
      provider: "aws-s3-v1",
      targetConfig: { bucket: "bucket", prefix: "vault/", region: "eu-west-1" },
    };
    const syncContext = {
      vaultId: "vault-id",
      deviceId: "device-id",
      provider: "aws-s3-v1" as const,
      target,
    };
    const state = {
      currentCredentials: {
        provider: "aws-s3-v1" as const,
        credentialsConfig: {
          accessKeyId: "access-key",
          secretAccessKey: "secret-key",
        },
      },
    };
    const syncContextWithRuntimeExtra = {
      ...syncContext,
      undeclaredContext: "ignored",
    };
    const encryptedState = await crypto.encryptDeviceSyncCredentialState(
      state,
      syncKey,
      syncContextWithRuntimeExtra,
    );
    await expect(
      crypto.decryptDeviceSyncCredentialState(
        encryptedState,
        syncKey,
        syncContext,
      ),
    ).resolves.toEqual(state);
    const encryptedStateWithDeclaredContext =
      await crypto.encryptDeviceSyncCredentialState(
        state,
        syncKey,
        syncContext,
      );
    await expect(
      crypto.decryptDeviceSyncCredentialState(
        encryptedStateWithDeclaredContext,
        syncKey,
        syncContextWithRuntimeExtra,
      ),
    ).resolves.toEqual(state);
    await expect(
      crypto.decryptDeviceSyncCredentialState(encryptedState, syncKey, {
        ...syncContext,
        deviceId: "other-device-id",
      }),
    ).rejects.toBeInstanceOf(InvalidDeviceSyncCredentialStateError);
  });

  it("uses JCS for signatures and digests independently of property insertion order", async () => {
    const crypto = new WebCryptoAdapter();
    const signing = await crypto.generateDeviceSignKeyPair();
    const vaultKeys = await crypto.generateDeviceVaultKeyPair();
    const checkpoint: LocalVaultTrustCheckpointPayload = {
      version: 1,
      vaultId: "vault-id",
      deviceId: "device-id",
      trustGeneration: 1,
      trustCertificateDigest: artifactDigest(2),
      vaultKeyGeneration: 1,
      snapshotVersionVector: { "device-id": 1 },
      snapshotDigest: artifactDigest(3),
    };
    const reorderedCheckpoint: LocalVaultTrustCheckpointPayload = {
      snapshotDigest: checkpoint.snapshotDigest,
      snapshotVersionVector: checkpoint.snapshotVersionVector,
      vaultKeyGeneration: checkpoint.vaultKeyGeneration,
      trustCertificateDigest: checkpoint.trustCertificateDigest,
      trustGeneration: checkpoint.trustGeneration,
      deviceId: checkpoint.deviceId,
      vaultId: checkpoint.vaultId,
      version: checkpoint.version,
    };
    const checkpointSignature = await crypto.signLocalVaultTrustCheckpoint(
      checkpoint,
      signing.privateKey,
    );
    await expect(
      crypto.verifyLocalVaultTrustCheckpointSignature(
        { payload: reorderedCheckpoint, signature: checkpointSignature },
        signing.publicKey,
      ),
    ).resolves.toBe(true);

    const trustPayload: VaultTrustCertificatePayload = {
      version: 1,
      vaultId: "vault-id",
      generation: 1,
      vaultKeyGeneration: 1,
      previousCertificateDigest: null,
      authorizedByDeviceId: "device-id",
      trustedDevices: [
        {
          deviceId: "device-id",
          publicSignKey: signing.publicKey,
          publicVaultKey: vaultKeys.publicKey,
        },
      ],
    };
    const trustSignature = await crypto.signVaultTrustCertificate(
      trustPayload,
      signing.privateKey,
    );
    const certificate = { payload: trustPayload, signature: trustSignature };
    await expect(
      crypto.verifyVaultTrustCertificateSignature(
        certificate,
        signing.publicKey,
      ),
    ).resolves.toBe(true);
    expect(await crypto.digestVaultTrustCertificate(certificate)).toBe(
      await crypto.digestVaultTrustCertificate(certificate),
    );

    const request: DeviceEnrollmentRequestPayload = {
      version: 1,
      requestId: "request-id",
      vaultId: "vault-id",
      expectedGenesisCertificateDigest: artifactDigest(1),
      deviceId: "device-id",
      algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
      publicSignKey: signing.publicKey,
      publicVaultKey: vaultKeys.publicKey,
    };
    await expect(
      crypto.verifyDeviceEnrollmentRequestSignature({
        payload: request,
        signature: await crypto.signDeviceEnrollmentRequest(
          request,
          signing.privateKey,
        ),
      }),
    ).resolves.toBe(true);
    expect(await crypto.digestDevicePublicSignKey(signing.publicKey)).toMatch(
      /^[A-Za-z0-9_-]{43}$/,
    );
  });

  it("signs and verifies snapshots and detects content changes", async () => {
    const crypto = new WebCryptoAdapter();
    const signing = await crypto.generateDeviceSignKeyPair();
    const snapshot = await createSnapshot(
      crypto,
      signing.publicKey,
      signing.privateKey,
    );

    await expect(
      crypto.verifyVaultSnapshotSignature(snapshot, signing.publicKey),
    ).resolves.toBe(true);
    await expect(
      crypto.verifyVaultSnapshotSignature(
        {
          ...snapshot,
          metadata: { ...snapshot.metadata, revisionTimestamp: 2 },
        },
        signing.publicKey,
      ),
    ).resolves.toBe(false);
    expect(await crypto.digestVaultSnapshot(snapshot)).toBe(
      await crypto.digestVaultSnapshot(snapshot),
    );
  });

  it("rejects authenticated malformed plaintext with the family error", async () => {
    const crypto = new WebCryptoAdapter();
    const key = await crypto.generateVaultMasterKey();
    const malformed = await encryptAuthenticatedJson<Vault>(
      key,
      { unexpected: true },
      { purpose: "lfspm-vault-snapshot-content-v1" },
    );

    await expect(
      crypto.decryptVaultSnapshotContent(malformed, key),
    ).rejects.toBeInstanceOf(InvalidVaultSnapshotPayloadError);
  });

  it("rejects authenticated domain-invalid vault fields and nested rollback keys", async () => {
    const crypto = new WebCryptoAdapter();
    const key = await crypto.generateVaultMasterKey();
    const invalidEntryVault: Vault = {
      ...createVault(),
      entries: [
        {
          id: "entry-id",
          password: "x".repeat(513),
          login: "login",
          tags: [],
          sanitizedUrl: "https://example.test",
          versionVector: { "device-id": 1 },
        },
      ],
    };
    const invalidEntryPayload = await crypto.encryptVaultSnapshotContent(
      invalidEntryVault,
      key,
    );

    await expect(
      crypto.decryptVaultSnapshotContent(invalidEntryPayload, key),
    ).rejects.toMatchObject({
      name: "InvalidVaultSnapshotPayloadError",
      message: "Vault snapshot payload is malformed.",
    });

    const signing = await crypto.generateDeviceSignKeyPair();
    const rollback = await createSnapshot(
      crypto,
      signing.publicKey,
      signing.privateKey,
    );
    const firstCertificate = rollback.trustChain.certificates[0];
    const firstDevice = firstCertificate?.payload.trustedDevices[0];
    if (firstCertificate === undefined || firstDevice === undefined) {
      throw new Error("Expected a rollback trust device in the test fixture.");
    }
    const invalidRollback: VaultSnapshot = {
      ...rollback,
      trustChain: {
        certificates: [
          {
            ...firstCertificate,
            payload: {
              ...firstCertificate.payload,
              trustedDevices: [
                {
                  ...firstDevice,
                  publicVaultKey: new Uint8Array(65)
                    .buffer as typeof firstDevice.publicVaultKey,
                },
              ],
            },
          },
        ],
      },
    };
    const rollbackPayload = await crypto.encryptVaultSnapshotContent(
      {
        ...createVault(),
        syncRemovalPending: {
          expectedRemoteSnapshotIdentity: null,
          rollbackSnapshot: invalidRollback,
        },
      },
      key,
    );

    let thrown: unknown;
    try {
      await crypto.decryptVaultSnapshotContent(rollbackPayload, key);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(InvalidVaultSnapshotPayloadError);
    expect(Object.hasOwn(thrown as object, "cause")).toBe(false);
  });

  it("rejects an authenticated opened vault key with the wrong byte length", async () => {
    const producer = new WebCryptoAdapter();
    const recipient = await producer.generateDeviceVaultKeyPair();
    const context = {
      vaultId: "vault-id",
      deviceId: "device-id",
      vaultKeyGeneration: 1,
      algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
    };
    const envelope = await producer.createDeviceVaultKeyEnvelope(
      await producer.generateVaultMasterKey(),
      recipient.publicKey,
      context,
    );
    const subtle = new Proxy(globalThis.crypto.subtle, {
      get(target, property, receiver) {
        if (property === "decrypt") {
          return async () => new Uint8Array(31).buffer;
        }
        const value: unknown = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const cryptoApi = Object.create(globalThis.crypto) as Crypto;
    Object.defineProperty(cryptoApi, "subtle", { value: subtle });
    const consumer = new WebCryptoAdapter(cryptoApi);

    await expect(
      consumer.openDeviceVaultKeyEnvelope(
        envelope,
        recipient.privateKey,
        context,
      ),
    ).rejects.toMatchObject({
      name: "InvalidOpenedVaultMasterKeyError",
      message: "Opened vault master key is malformed.",
    });
  });
});

function createVault(): Vault {
  return {
    versionVector: { "device-id": 1 },
    entries: [],
    deletedEntries: [],
    deviceProfiles: [
      {
        id: "device-id",
        name: "Device",
        createdAt: 1,
        versionVector: { "device-id": 1 },
      },
    ],
    deletedDeviceProfiles: [],
    tags: [],
    deletedTags: [],
  };
}

async function createEnrollmentPrivateStateFixture() {
  const crypto = new WebCryptoAdapter();
  const signing = await crypto.generateDeviceSignKeyPair();
  const vault = await crypto.generateDeviceVaultKeyPair();
  const requestPayload: DeviceEnrollmentRequestPayload = {
    version: 1,
    requestId: "request-id",
    vaultId: "vault-id",
    expectedGenesisCertificateDigest: artifactDigest(1),
    deviceId: "device-id",
    algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
    publicSignKey: signing.publicKey,
    publicVaultKey: vault.publicKey,
  };
  const request = {
    payload: requestPayload,
    signature: await crypto.signDeviceEnrollmentRequest(
      requestPayload,
      signing.privateKey,
    ),
  };
  const deviceLocalProtectionKey =
    await crypto.generateDeviceLocalProtectionKey();
  const root = await crypto.deriveLocalRootKey(
    "master-password" as RawMasterPassword,
    await crypto.generateMasterPasswordSalt(),
  );
  const protectionKey =
    await crypto.deriveDeviceEnrollmentPrivateStateProtectionKey(
      root,
      await crypto.generateLocalKeysProtectionSalt(),
    );

  return {
    crypto,
    protectionKey,
    encoded: {
      request: {
        payload: {
          ...request.payload,
          publicSignKey: encodeBase64Url(
            new Uint8Array(request.payload.publicSignKey),
          ),
          publicVaultKey: encodeBase64Url(
            new Uint8Array(request.payload.publicVaultKey),
          ),
        },
        signature: request.signature,
      },
      devicePrivateSignKey: encodeBase64Url(new Uint8Array(signing.privateKey)),
      devicePrivateVaultKey: encodeBase64Url(new Uint8Array(vault.privateKey)),
      deviceLocalProtectionKey: encodeBase64Url(
        new Uint8Array(deviceLocalProtectionKey),
      ),
    },
  };
}

async function encryptEnrollmentPrivateState(
  protectionKey: DeviceEnrollmentPrivateStateProtectionKey,
  payload: unknown,
): Promise<SerializedWrapped<DeviceEnrollmentPrivateState>> {
  const encrypted =
    await encryptAuthenticatedJson<DeviceEnrollmentPrivateState>(
      protectionKey,
      payload,
      { purpose: "lfspm-device-enrollment-private-state-v1" },
    );
  return {
    wrappedKey: encrypted.ciphertext,
    wrappingNonce: encrypted.encryptionNonce,
  };
}

async function createSnapshot(
  crypto: WebCryptoAdapter,
  publicSignKey: DevicePublicSignKey,
  privateSignKey: Awaited<
    ReturnType<WebCryptoAdapter["generateDeviceSignKeyPair"]>
  >["privateKey"],
): Promise<VaultSnapshot> {
  const vaultKeys = await crypto.generateDeviceVaultKeyPair();
  const trustPayload: VaultTrustCertificatePayload = {
    version: 1,
    vaultId: "vault-id",
    generation: 1,
    vaultKeyGeneration: 1,
    previousCertificateDigest: null,
    authorizedByDeviceId: "device-id",
    trustedDevices: [
      {
        deviceId: "device-id",
        publicSignKey,
        publicVaultKey: vaultKeys.publicKey,
      },
    ],
  };
  const certificate = {
    payload: trustPayload,
    signature: await crypto.signVaultTrustCertificate(
      trustPayload,
      privateSignKey,
    ),
  };
  const unsigned = {
    metadata: {
      id: "snapshot-id",
      schemaVersion: 1 as const,
      vaultCreationTimestamp: 1,
      revisionTimestamp: 1,
      snapshotVersionVector: { "device-id": 1 },
      algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
      createdByDeviceId: "device-id",
      vaultKeyGeneration: 1,
    },
    trustChain: { certificates: [certificate] },
    keySlots: { deviceSlots: [] },
    content: await crypto.encryptVaultSnapshotContent(
      createVault(),
      await crypto.generateVaultMasterKey(),
    ),
  };

  return {
    ...unsigned,
    signature: await crypto.signVaultSnapshot(unsigned, privateSignKey),
  };
}

async function encryptAuthenticatedJson<Payload>(
  key: ArrayBuffer,
  payload: unknown,
  additionalData: unknown,
): Promise<SerializedEncrypted<Payload>> {
  const importedKey = await globalThis.crypto.subtle.importKey(
    "raw",
    key,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const nonce = new Uint8Array(12);
  globalThis.crypto.getRandomValues(nonce);
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: nonce,
      additionalData: encoder.encode(canonicalize(additionalData)),
      tagLength: 128,
    },
    importedKey,
    encoder.encode(canonicalize(payload)),
  );

  return {
    ciphertext: encodeBase64Url(new Uint8Array(ciphertext)),
    encryptionNonce: encodeBase64Url(nonce),
  };
}

function bytes(value: ArrayBuffer): number[] {
  return Array.from(new Uint8Array(value));
}

function decodeUtf8(value: BufferSource): string {
  const bytes = ArrayBuffer.isView(value)
    ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    : new Uint8Array(value);
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
