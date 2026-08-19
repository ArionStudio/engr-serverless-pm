import {
  CURRENT_ALGORITHM_SUITE,
  type CryptoPort,
  type DeviceEnrollmentPrivateState,
  type DeviceEnrollmentPrivateStateProtectionKey,
  type DeviceEnrollmentRequest,
  type DeviceEnrollmentRequestPayload,
  type DeviceLocalProtectionKey,
  type DevicePrivateSignKey,
  type DevicePublicSignKey,
  type DeviceSignKeyPair,
  type DeviceSyncCredentialEncryptionContext,
  type DeviceSyncCredentialState,
  type DeviceVaultKeyEnvelope,
  type DeviceVaultKeyEnvelopeContext,
  type DeviceVaultKeyPair,
  type DeviceVaultPrivateKey,
  type DeviceVaultPublicKey,
  type EncryptedDeviceSyncCredentialState,
  type LocalKeysPayload,
  type LocalRootKey,
  type LocalVaultTrustCheckpoint,
  type LocalVaultTrustCheckpointPayload,
  type ProtectionKeyFor,
  type RandomBytes,
  type RawMasterPassword,
  type RecoverySecretKey,
  type SerializedEncrypted,
  type SerializedSignatureOf,
  type SerializedWrapped,
  type UnlockedVaultSessionPayloadKey,
  type UnsignedVaultSnapshot,
  type Vault,
  type VaultMasterKey,
  type VaultSnapshot,
  type VaultTrustCertificate,
  type VaultTrustCertificatePayload,
  type VersionVector,
} from "@lfspm/core";
import {
  bestEffortWipeArrayBuffers,
  decodeBase64Url,
  encodeBase64Url,
  secureWipe,
} from "@lfspm/core/lib";
import { canonicalize } from "json-canonicalize";
import {
  decodeDeviceEnrollmentPrivateState,
  encodeDeviceEnrollmentPrivateState,
  InvalidDeviceEnrollmentPrivateStateError,
} from "../codecs/device-enrollment-artifact.codec";
import {
  decodeLocalKeysPayload,
  encodeLocalKeysPayload,
  InvalidLocalKeysPayloadError,
} from "../codecs/local-vault-security.codec";
import {
  decodeDeviceSyncCredentialState,
  encodeDeviceSyncCredentialState,
  InvalidDeviceSyncCredentialStateError,
} from "../codecs/sync-credential.codec";
import {
  decodeUnlockedVaultSessionPayload,
  encodeUnlockedVaultSessionPayload,
  InvalidUnlockedVaultSessionPayloadError,
} from "../codecs/unlocked-session-payload.codec";
import {
  decodeVault,
  encodeVault,
  InvalidOpenedVaultMasterKeyError,
  InvalidVaultSnapshotPayloadError,
} from "../codecs/vault-snapshot.codec";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });
const AES_KEY_LENGTH_BYTES =
  CURRENT_ALGORITHM_SUITE.vaultMasterKeyGeneration.keyLengthBits / 8;
const AES_GCM_TAG_LENGTH_BITS = 128;
const AES_GCM_TAG_LENGTH_BYTES = AES_GCM_TAG_LENGTH_BITS / 8;
const ED25519_SIGNATURE_LENGTH_BYTES = 64;
const RANDOM_CHUNK_LENGTH = 65_536;

type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | CanonicalJsonValue[]
  | { readonly [key: string]: CanonicalJsonValue };

type StaticErrorConstructor = new () => Error;

type SessionPayload = {
  readonly vault: Vault;
};

type SessionContext = {
  readonly sessionId: string;
  readonly vaultId: string;
  readonly sourceSnapshotVersionVector: VersionVector;
};

export interface AsymmetricKeyValidator {
  importDeviceSignPublicKey(publicKey: DevicePublicSignKey): Promise<CryptoKey>;
  importDeviceSignPrivateKey(
    privateKey: DevicePrivateSignKey,
  ): Promise<CryptoKey>;
  importDeviceVaultPublicKey(
    publicKey: DeviceVaultPublicKey,
  ): Promise<CryptoKey>;
  importDeviceVaultPrivateKey(
    privateKey: DeviceVaultPrivateKey,
  ): Promise<CryptoKey>;
}

export class WebCryptoAsymmetricKeyValidator implements AsymmetricKeyValidator {
  private readonly crypto: Crypto;

  constructor(cryptoApi: Crypto = globalThis.crypto) {
    this.crypto = cryptoApi;
  }

  async importDeviceSignPublicKey(
    publicKey: DevicePublicSignKey,
  ): Promise<CryptoKey> {
    requireBufferLength(
      publicKey,
      CURRENT_ALGORITHM_SUITE.signing.publicKeyLengthBytes,
      "Device signing public key",
    );
    return this.crypto.subtle.importKey(
      CURRENT_ALGORITHM_SUITE.signing.publicKeyFormat,
      publicKey,
      { name: CURRENT_ALGORITHM_SUITE.signing.algorithm },
      false,
      ["verify"],
    );
  }

  async importDeviceSignPrivateKey(
    privateKey: DevicePrivateSignKey,
  ): Promise<CryptoKey> {
    requireBufferLength(
      privateKey,
      CURRENT_ALGORITHM_SUITE.signing.privateKeyLengthBytes,
      "Device signing private key",
    );
    return this.crypto.subtle.importKey(
      CURRENT_ALGORITHM_SUITE.signing.privateKeyFormat,
      privateKey,
      { name: CURRENT_ALGORITHM_SUITE.signing.algorithm },
      false,
      ["sign"],
    );
  }

  async importDeviceVaultPublicKey(
    publicKey: DeviceVaultPublicKey,
  ): Promise<CryptoKey> {
    requireBufferLength(
      publicKey,
      CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.publicKeyLengthBytes,
      "Device vault public key",
    );
    return this.crypto.subtle.importKey(
      CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.publicKeyFormat,
      publicKey,
      {
        name: CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.keyAgreement,
        namedCurve: CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.namedCurve,
      },
      false,
      [],
    );
  }

  async importDeviceVaultPrivateKey(
    privateKey: DeviceVaultPrivateKey,
  ): Promise<CryptoKey> {
    requireBufferLength(
      privateKey,
      CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.privateKeyLengthBytes,
      "Device vault private key",
    );
    return this.crypto.subtle.importKey(
      CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.privateKeyFormat,
      privateKey,
      {
        name: CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.keyAgreement,
        namedCurve: CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.namedCurve,
      },
      false,
      ["deriveBits"],
    );
  }
}

export async function validateVaultSnapshotPublicKeys(
  snapshot: VaultSnapshot,
  validator: AsymmetricKeyValidator,
): Promise<void> {
  for (const certificate of snapshot.trustChain.certificates) {
    for (const device of certificate.payload.trustedDevices) {
      await validator.importDeviceSignPublicKey(device.publicSignKey);
      await validator.importDeviceVaultPublicKey(device.publicVaultKey);
    }
  }

  for (const slot of snapshot.keySlots.deviceSlots) {
    await validator.importDeviceVaultPublicKey(
      slot.envelope.ephemeralPublicKey,
    );
  }
}

export class WebCryptoPort implements CryptoPort {
  readonly algorithmSuite = CURRENT_ALGORITHM_SUITE;

  private readonly crypto: Crypto;
  private readonly asymmetricKeyValidator: AsymmetricKeyValidator;

  constructor(
    cryptoApi: Crypto = globalThis.crypto,
    asymmetricKeyValidator: AsymmetricKeyValidator = new WebCryptoAsymmetricKeyValidator(
      cryptoApi,
    ),
  ) {
    this.crypto = cryptoApi;
    this.asymmetricKeyValidator = asymmetricKeyValidator;
  }

  async generateRandomBytes(byteLength: number): Promise<RandomBytes> {
    if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
      throw new RangeError(
        "Random byte length must be a nonnegative safe integer.",
      );
    }

    const bytes = new Uint8Array(byteLength);

    for (let offset = 0; offset < bytes.length; offset += RANDOM_CHUNK_LENGTH) {
      this.crypto.getRandomValues(
        bytes.subarray(
          offset,
          Math.min(offset + RANDOM_CHUNK_LENGTH, bytes.length),
        ),
      );
    }

    return bytes.buffer as RandomBytes;
  }

  async generateDeviceSignKeyPair(): Promise<DeviceSignKeyPair> {
    const pair = await this.crypto.subtle.generateKey(
      { name: CURRENT_ALGORITHM_SUITE.signing.algorithm },
      true,
      ["sign", "verify"],
    );

    return {
      publicKey: (await this.crypto.subtle.exportKey(
        CURRENT_ALGORITHM_SUITE.signing.publicKeyFormat,
        pair.publicKey,
      )) as DevicePublicSignKey,
      privateKey: (await this.crypto.subtle.exportKey(
        CURRENT_ALGORITHM_SUITE.signing.privateKeyFormat,
        pair.privateKey,
      )) as DevicePrivateSignKey,
    };
  }

  async generateDeviceVaultKeyPair(): Promise<DeviceVaultKeyPair> {
    const pair = await this.crypto.subtle.generateKey(
      {
        name: CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.keyAgreement,
        namedCurve: CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.namedCurve,
      },
      true,
      ["deriveBits"],
    );

    return {
      publicKey: (await this.crypto.subtle.exportKey(
        CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.publicKeyFormat,
        pair.publicKey,
      )) as DeviceVaultPublicKey,
      privateKey: (await this.crypto.subtle.exportKey(
        CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.privateKeyFormat,
        pair.privateKey,
      )) as DeviceVaultPrivateKey,
    };
  }

  async generateDeviceLocalProtectionKey(): Promise<DeviceLocalProtectionKey> {
    return (await this.generateRandomBytes(
      CURRENT_ALGORITHM_SUITE.deviceLocalProtectionKeyGeneration.byteLength,
    )) as unknown as DeviceLocalProtectionKey;
  }

  async generateVaultMasterKey(): Promise<VaultMasterKey> {
    return (await this.generateRandomBytes(
      AES_KEY_LENGTH_BYTES,
    )) as unknown as VaultMasterKey;
  }

  async generateRecoveryKey(): Promise<RecoverySecretKey> {
    return (await this.generateRandomBytes(
      CURRENT_ALGORITHM_SUITE.recoverySecretGeneration.byteLength,
    )) as unknown as RecoverySecretKey;
  }

  async generateUnlockedVaultSessionPayloadKey(): Promise<UnlockedVaultSessionPayloadKey> {
    return (await this.generateRandomBytes(
      CURRENT_ALGORITHM_SUITE.unlockedVaultSessionPayloadKeyGeneration
        .byteLength,
    )) as unknown as UnlockedVaultSessionPayloadKey;
  }

  async generateMasterPasswordSalt(): Promise<RandomBytes> {
    return this.generateRandomBytes(
      CURRENT_ALGORITHM_SUITE.localProtectionKeyDerivation.saltLengthBytes,
    );
  }

  async generateLocalKeysProtectionSalt(): Promise<RandomBytes> {
    return this.generateRandomBytes(
      CURRENT_ALGORITHM_SUITE.localProtectionKeyDerivation.saltLengthBytes,
    );
  }

  async generateRecoveryLocalKeysProtectionSalt(): Promise<RandomBytes> {
    return this.generateRandomBytes(
      CURRENT_ALGORITHM_SUITE.localProtectionKeyDerivation.saltLengthBytes,
    );
  }

  async deriveLocalRootKey(
    masterPassword: RawMasterPassword,
    salt: RandomBytes,
  ): Promise<LocalRootKey> {
    requireBufferLength(
      salt,
      CURRENT_ALGORITHM_SUITE.localProtectionKeyDerivation.saltLengthBytes,
      "Master-password salt",
    );
    const passwordBytes = textEncoder.encode(masterPassword);

    try {
      const material = await this.crypto.subtle.importKey(
        "raw",
        passwordBytes,
        CURRENT_ALGORITHM_SUITE.localProtectionKeyDerivation.algorithm,
        false,
        ["deriveBits"],
      );
      const bits = await this.crypto.subtle.deriveBits(
        {
          name: CURRENT_ALGORITHM_SUITE.localProtectionKeyDerivation.algorithm,
          hash: CURRENT_ALGORITHM_SUITE.localProtectionKeyDerivation.hash,
          iterations:
            CURRENT_ALGORITHM_SUITE.localProtectionKeyDerivation.iterations,
          salt,
        },
        material,
        CURRENT_ALGORITHM_SUITE.localProtectionKeyDerivation
          .outputKeyLengthBits,
      );

      return bits as LocalRootKey;
    } finally {
      secureWipe(passwordBytes);
    }
  }

  async deriveLocalKeysProtectionKey(
    localRootKey: LocalRootKey,
    salt: RandomBytes,
  ): Promise<ProtectionKeyFor<LocalKeysPayload>> {
    return (await this.deriveHkdfKey(
      localRootKey,
      salt,
      "lfspm-local-keys-protection-v1",
    )) as ProtectionKeyFor<LocalKeysPayload>;
  }

  async deriveRecoveryLocalKeysProtectionKey(
    recoveryKey: RecoverySecretKey,
    salt: RandomBytes,
  ): Promise<ProtectionKeyFor<LocalKeysPayload>> {
    return (await this.deriveHkdfKey(
      recoveryKey,
      salt,
      "lfspm-recovery-local-keys-protection-v1",
    )) as ProtectionKeyFor<LocalKeysPayload>;
  }

  async deriveDeviceEnrollmentPrivateStateProtectionKey(
    localRootKey: LocalRootKey,
    salt: RandomBytes,
  ): Promise<DeviceEnrollmentPrivateStateProtectionKey> {
    return (await this.deriveHkdfKey(
      localRootKey,
      salt,
      "lfspm-device-enrollment-private-state-protection-v1",
    )) as DeviceEnrollmentPrivateStateProtectionKey;
  }

  async wrapLocalKeysPayload(
    localKeysPayload: LocalKeysPayload,
    protectionKey: ProtectionKeyFor<LocalKeysPayload>,
  ): Promise<SerializedWrapped<LocalKeysPayload>> {
    return this.wrapJson(
      encodeLocalKeysPayload(localKeysPayload),
      protectionKey,
      "lfspm-local-keys-payload-v1",
    );
  }

  async unwrapLocalKeysPayload(
    protectedLocalKeys: SerializedWrapped<LocalKeysPayload>,
    protectionKey: ProtectionKeyFor<LocalKeysPayload>,
  ): Promise<LocalKeysPayload> {
    let payload: LocalKeysPayload | undefined;
    try {
      payload = await this.unwrapJson(
        protectedLocalKeys,
        protectionKey,
        "lfspm-local-keys-payload-v1",
        decodeLocalKeysPayload,
        InvalidLocalKeysPayloadError,
      );
      const importResults = await Promise.allSettled([
        this.importDeviceSignPrivateKey(payload.devicePrivateSignKey),
        this.importDeviceVaultPrivateKey(payload.devicePrivateVaultKey),
        this.importDeviceSignPublicKey(
          payload.vaultTrustAnchor.genesisPublicSignKey,
        ),
      ]);
      if (importResults.some(({ status }) => status === "rejected")) {
        throw new Error("Local keys contain an invalid asymmetric key.");
      }
      requireBufferLength(
        payload.deviceLocalProtectionKey,
        CURRENT_ALGORITHM_SUITE.deviceLocalProtectionKeyGeneration.byteLength,
        "Device local protection key",
      );
      return payload;
    } catch (error) {
      if (payload !== undefined) {
        bestEffortWipeArrayBuffers([
          payload.devicePrivateSignKey,
          payload.devicePrivateVaultKey,
          payload.deviceLocalProtectionKey,
        ]);
      }
      if (error instanceof InvalidLocalKeysPayloadError) {
        throw error;
      }

      throw new InvalidLocalKeysPayloadError();
    }
  }

  async wrapDeviceEnrollmentPrivateState(
    privateState: DeviceEnrollmentPrivateState,
    protectionKey: DeviceEnrollmentPrivateStateProtectionKey,
  ): Promise<SerializedWrapped<DeviceEnrollmentPrivateState>> {
    return this.wrapJson(
      encodeDeviceEnrollmentPrivateState(privateState),
      protectionKey,
      "lfspm-device-enrollment-private-state-v1",
    );
  }

  async unwrapDeviceEnrollmentPrivateState(
    protectedPrivateState: SerializedWrapped<DeviceEnrollmentPrivateState>,
    protectionKey: DeviceEnrollmentPrivateStateProtectionKey,
  ): Promise<DeviceEnrollmentPrivateState> {
    let state: DeviceEnrollmentPrivateState | undefined;
    try {
      state = await this.unwrapJson(
        protectedPrivateState,
        protectionKey,
        "lfspm-device-enrollment-private-state-v1",
        decodeDeviceEnrollmentPrivateState,
        InvalidDeviceEnrollmentPrivateStateError,
      );
      const importResults = await Promise.allSettled([
        this.importDeviceSignPrivateKey(state.devicePrivateSignKey),
        this.importDeviceVaultPrivateKey(state.devicePrivateVaultKey),
        this.importDeviceSignPublicKey(state.request.payload.publicSignKey),
        this.importDeviceVaultPublicKey(state.request.payload.publicVaultKey),
      ]);
      if (importResults.some(({ status }) => status === "rejected")) {
        throw new Error("Enrollment state contains an invalid asymmetric key.");
      }
      requireBufferLength(
        state.deviceLocalProtectionKey,
        CURRENT_ALGORITHM_SUITE.deviceLocalProtectionKeyGeneration.byteLength,
        "Device local protection key",
      );
      return state;
    } catch (error) {
      if (state !== undefined) {
        bestEffortWipeArrayBuffers([
          state.devicePrivateSignKey,
          state.devicePrivateVaultKey,
          state.deviceLocalProtectionKey,
        ]);
      }
      if (error instanceof InvalidDeviceEnrollmentPrivateStateError) {
        throw error;
      }

      throw new InvalidDeviceEnrollmentPrivateStateError();
    }
  }

  async createDeviceVaultKeyEnvelope(
    vaultMasterKey: VaultMasterKey,
    recipientPublicKey: DeviceVaultPublicKey,
    context: DeviceVaultKeyEnvelopeContext,
  ): Promise<DeviceVaultKeyEnvelope> {
    if (context.algorithmSuiteId !== CURRENT_ALGORITHM_SUITE.id) {
      throw new Error("Vault envelope algorithm suite is unsupported.");
    }

    requireBufferLength(
      vaultMasterKey,
      AES_KEY_LENGTH_BYTES,
      "Vault master key",
    );
    const importedRecipient =
      await this.importDeviceVaultPublicKey(recipientPublicKey);
    const ephemeralPair = await this.crypto.subtle.generateKey(
      {
        name: CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.keyAgreement,
        namedCurve: CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.namedCurve,
      },
      false,
      ["deriveBits"],
    );
    let sharedSecret: ArrayBuffer | undefined;

    try {
      sharedSecret = await this.crypto.subtle.deriveBits(
        {
          name: CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.keyAgreement,
          public: importedRecipient,
        },
        ephemeralPair.privateKey,
        CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.keyLengthBits,
      );
      const hkdfSalt = await this.generateRandomBytes(
        CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.saltLengthBytes,
      );
      const wrappingKey = await this.deriveVaultEnvelopeKey(
        sharedSecret,
        hkdfSalt,
        context,
      );
      const encryptedVaultMasterKey = await this.encryptBytes<VaultMasterKey>(
        vaultMasterKey,
        wrappingKey,
        CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.nonceLengthBytes,
        canonicalBytes(
          projectDeclaredFields(
            context,
            CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.authenticatedData,
          ),
        ),
      );
      const ephemeralPublicKey = copyBuffer(
        await this.crypto.subtle.exportKey(
          CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.publicKeyFormat,
          ephemeralPair.publicKey,
        ),
      ) as DeviceVaultPublicKey;

      return {
        recipientDeviceId: context.deviceId,
        vaultKeyGeneration: context.vaultKeyGeneration,
        ephemeralPublicKey,
        hkdfSalt,
        encryptedVaultMasterKey,
      };
    } finally {
      bestEffortWipeArrayBuffers([sharedSecret]);
    }
  }

  async openDeviceVaultKeyEnvelope(
    envelope: DeviceVaultKeyEnvelope,
    recipientPrivateKey: DeviceVaultPrivateKey,
    context: DeviceVaultKeyEnvelopeContext,
  ): Promise<VaultMasterKey> {
    try {
      if (
        context.algorithmSuiteId !== CURRENT_ALGORITHM_SUITE.id ||
        envelope.recipientDeviceId !== context.deviceId ||
        envelope.vaultKeyGeneration !== context.vaultKeyGeneration
      ) {
        throw new InvalidOpenedVaultMasterKeyError();
      }

      requireBufferLength(
        envelope.hkdfSalt,
        CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.saltLengthBytes,
        "Vault envelope HKDF salt",
      );
      const privateKey =
        await this.importDeviceVaultPrivateKey(recipientPrivateKey);
      const ephemeralPublicKey = await this.importDeviceVaultPublicKey(
        envelope.ephemeralPublicKey,
      );
      const sharedSecret = await this.crypto.subtle.deriveBits(
        {
          name: CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.keyAgreement,
          public: ephemeralPublicKey,
        },
        privateKey,
        CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.keyLengthBits,
      );

      try {
        const wrappingKey = await this.deriveVaultEnvelopeKey(
          sharedSecret,
          envelope.hkdfSalt,
          context,
        );
        const opened = await this.decryptBytes(
          envelope.encryptedVaultMasterKey,
          wrappingKey,
          CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.nonceLengthBytes,
          canonicalBytes(
            projectDeclaredFields(
              context,
              CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.authenticatedData,
            ),
          ),
        );

        try {
          requireBufferLength(opened, AES_KEY_LENGTH_BYTES, "Vault master key");
          return ownedBytes(opened).buffer as VaultMasterKey;
        } finally {
          secureWipe(opened);
        }
      } finally {
        secureWipe(new Uint8Array(sharedSecret));
      }
    } catch (error) {
      if (error instanceof InvalidOpenedVaultMasterKeyError) {
        throw error;
      }

      throw new InvalidOpenedVaultMasterKeyError();
    }
  }

  async digestDevicePublicSignKey(
    publicSignKey: DevicePublicSignKey,
  ): Promise<string> {
    requireBufferLength(
      publicSignKey,
      CURRENT_ALGORITHM_SUITE.signing.publicKeyLengthBytes,
      "Device signing public key",
    );
    await this.importDeviceSignPublicKey(publicSignKey);
    return this.digestBytes(publicSignKey);
  }

  async digestDevicePublicVaultKey(
    publicVaultKey: DeviceVaultPublicKey,
  ): Promise<string> {
    await this.importDeviceVaultPublicKey(publicVaultKey);
    return this.digestBytes(publicVaultKey);
  }

  async encryptVaultSnapshotContent(
    vault: Vault,
    vaultMasterKey: VaultMasterKey,
  ): Promise<SerializedEncrypted<Vault>> {
    return this.encryptJson(
      encodeVault(vault),
      vaultMasterKey,
      CURRENT_ALGORITHM_SUITE.vaultSnapshotEncryption.nonceLengthBytes,
      "lfspm-vault-snapshot-content-v1",
    );
  }

  async decryptVaultSnapshotContent(
    encryptedVault: SerializedEncrypted<Vault>,
    vaultMasterKey: VaultMasterKey,
  ): Promise<Vault> {
    try {
      const vault = await this.decryptJson(
        encryptedVault,
        vaultMasterKey,
        CURRENT_ALGORITHM_SUITE.vaultSnapshotEncryption.nonceLengthBytes,
        "lfspm-vault-snapshot-content-v1",
        decodeVault,
        InvalidVaultSnapshotPayloadError,
      );

      if (vault.syncRemovalPending !== undefined) {
        await validateVaultSnapshotPublicKeys(
          vault.syncRemovalPending.rollbackSnapshot,
          this.asymmetricKeyValidator,
        );
      }

      return vault;
    } catch (error) {
      if (error instanceof InvalidVaultSnapshotPayloadError) {
        throw error;
      }

      throw new InvalidVaultSnapshotPayloadError();
    }
  }

  async encryptUnlockedVaultSessionPayload(
    payload: SessionPayload,
    payloadKey: UnlockedVaultSessionPayloadKey,
    context: SessionContext,
  ): Promise<SerializedEncrypted<SessionPayload>> {
    return this.encryptJson(
      encodeUnlockedVaultSessionPayload(payload),
      payloadKey,
      CURRENT_ALGORITHM_SUITE.unlockedVaultSessionPayloadEncryption
        .nonceLengthBytes,
      "lfspm-unlocked-vault-session-payload-v1",
      context,
    );
  }

  async decryptUnlockedVaultSessionPayload(
    encryptedPayload: SerializedEncrypted<SessionPayload>,
    payloadKey: UnlockedVaultSessionPayloadKey,
    context: SessionContext,
  ): Promise<SessionPayload> {
    return this.decryptJson(
      encryptedPayload,
      payloadKey,
      CURRENT_ALGORITHM_SUITE.unlockedVaultSessionPayloadEncryption
        .nonceLengthBytes,
      "lfspm-unlocked-vault-session-payload-v1",
      decodeUnlockedVaultSessionPayload,
      InvalidUnlockedVaultSessionPayloadError,
      context,
    );
  }

  async signVaultSnapshot(
    snapshot: UnsignedVaultSnapshot,
    privateKey: DevicePrivateSignKey,
  ): Promise<SerializedSignatureOf<UnsignedVaultSnapshot>> {
    return this.signCanonical(snapshot, privateKey);
  }

  async verifyVaultSnapshotSignature(
    snapshot: VaultSnapshot,
    publicKey: DevicePublicSignKey,
  ): Promise<boolean> {
    const { signature, ...unsignedSnapshot } = snapshot;
    return this.verifyCanonical(unsignedSnapshot, signature, publicKey);
  }

  async verifyDeviceSignKeyPair(
    publicKey: DevicePublicSignKey,
    privateKey: DevicePrivateSignKey,
  ): Promise<boolean> {
    try {
      const challenge = canonicalBytes({
        purpose: "lfspm-device-sign-key-pair-check-v1",
      });
      const importedPrivateKey =
        await this.importDeviceSignPrivateKey(privateKey);
      const importedPublicKey = await this.importDeviceSignPublicKey(publicKey);
      const signature = await this.crypto.subtle.sign(
        CURRENT_ALGORITHM_SUITE.signing.algorithm,
        importedPrivateKey,
        challenge,
      );

      return this.crypto.subtle.verify(
        CURRENT_ALGORITHM_SUITE.signing.algorithm,
        importedPublicKey,
        signature,
        challenge,
      );
    } catch {
      return false;
    }
  }

  async verifyDeviceVaultKeyPair(
    publicKey: DeviceVaultPublicKey,
    privateKey: DeviceVaultPrivateKey,
  ): Promise<boolean> {
    let first: ArrayBuffer | undefined;
    let second: ArrayBuffer | undefined;
    try {
      const importedPublicKey =
        await this.importDeviceVaultPublicKey(publicKey);
      const importedPrivateKey =
        await this.importDeviceVaultPrivateKey(privateKey);
      const probePair = await this.crypto.subtle.generateKey(
        {
          name: CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.keyAgreement,
          namedCurve: CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.namedCurve,
        },
        false,
        ["deriveBits"],
      );
      first = await this.crypto.subtle.deriveBits(
        {
          name: CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.keyAgreement,
          public: probePair.publicKey,
        },
        importedPrivateKey,
        CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.keyLengthBits,
      );
      second = await this.crypto.subtle.deriveBits(
        {
          name: CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.keyAgreement,
          public: importedPublicKey,
        },
        probePair.privateKey,
        CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.keyLengthBits,
      );

      return equalBytes(new Uint8Array(first), new Uint8Array(second));
    } catch {
      return false;
    } finally {
      bestEffortWipeArrayBuffers([first, second]);
    }
  }

  async digestVaultTrustCertificate(
    certificate: VaultTrustCertificate,
  ): Promise<string> {
    return this.digestBytes(canonicalBytes(certificate));
  }

  async signVaultTrustCertificate(
    payload: VaultTrustCertificatePayload,
    privateKey: DevicePrivateSignKey,
  ): Promise<SerializedSignatureOf<VaultTrustCertificatePayload>> {
    return this.signCanonical(payload, privateKey);
  }

  async verifyVaultTrustCertificateSignature(
    certificate: VaultTrustCertificate,
    publicKey: DevicePublicSignKey,
  ): Promise<boolean> {
    return this.verifyCanonical(
      certificate.payload,
      certificate.signature,
      publicKey,
    );
  }

  async digestVaultSnapshot(snapshot: VaultSnapshot): Promise<string> {
    return this.digestBytes(canonicalBytes(snapshot));
  }

  async signLocalVaultTrustCheckpoint(
    payload: LocalVaultTrustCheckpointPayload,
    privateKey: DevicePrivateSignKey,
  ): Promise<SerializedSignatureOf<LocalVaultTrustCheckpointPayload>> {
    return this.signCanonical(payload, privateKey);
  }

  async verifyLocalVaultTrustCheckpointSignature(
    checkpoint: LocalVaultTrustCheckpoint,
    publicKey: DevicePublicSignKey,
  ): Promise<boolean> {
    return this.verifyCanonical(
      checkpoint.payload,
      checkpoint.signature,
      publicKey,
    );
  }

  async signDeviceEnrollmentRequest(
    request: DeviceEnrollmentRequestPayload,
    privateKey: DevicePrivateSignKey,
  ): Promise<SerializedSignatureOf<DeviceEnrollmentRequestPayload>> {
    return this.signCanonical(request, privateKey);
  }

  async verifyDeviceEnrollmentRequestSignature(
    request: DeviceEnrollmentRequest,
  ): Promise<boolean> {
    return this.verifyCanonical(
      request.payload,
      request.signature,
      request.payload.publicSignKey,
    );
  }

  async encryptDeviceSyncCredentialState(
    state: DeviceSyncCredentialState,
    protectionKey: DeviceLocalProtectionKey,
    context: DeviceSyncCredentialEncryptionContext,
  ): Promise<EncryptedDeviceSyncCredentialState> {
    return this.encryptJson(
      encodeDeviceSyncCredentialState(state),
      protectionKey,
      CURRENT_ALGORITHM_SUITE.deviceSyncCredentialEncryption.nonceLengthBytes,
      "lfspm-device-sync-credential-state-v1",
      context,
    );
  }

  async decryptDeviceSyncCredentialState(
    encryptedState: EncryptedDeviceSyncCredentialState,
    protectionKey: DeviceLocalProtectionKey,
    context: DeviceSyncCredentialEncryptionContext,
  ): Promise<DeviceSyncCredentialState> {
    return this.decryptJson(
      encryptedState,
      protectionKey,
      CURRENT_ALGORITHM_SUITE.deviceSyncCredentialEncryption.nonceLengthBytes,
      "lfspm-device-sync-credential-state-v1",
      decodeDeviceSyncCredentialState,
      InvalidDeviceSyncCredentialStateError,
      context,
    );
  }

  private async deriveHkdfKey(
    keyMaterial: ArrayBuffer,
    salt: RandomBytes,
    purpose: string,
  ): Promise<ArrayBuffer> {
    requireBufferLength(keyMaterial, AES_KEY_LENGTH_BYTES, "HKDF key material");
    requireBufferLength(
      salt,
      CURRENT_ALGORITHM_SUITE.localProtectionKeyDerivation.saltLengthBytes,
      "HKDF salt",
    );
    const importedMaterial = await this.crypto.subtle.importKey(
      "raw",
      keyMaterial,
      CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.keyDerivation,
      false,
      ["deriveBits"],
    );
    const bits = await this.crypto.subtle.deriveBits(
      {
        name: CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.keyDerivation,
        hash: CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.hash,
        salt,
        info: canonicalBytes({ purpose }),
      },
      importedMaterial,
      CURRENT_ALGORITHM_SUITE.localProtectionKeyDerivation.outputKeyLengthBits,
    );

    return bits;
  }

  private async deriveVaultEnvelopeKey(
    sharedSecret: ArrayBuffer,
    salt: RandomBytes,
    context: DeviceVaultKeyEnvelopeContext,
  ): Promise<CryptoKey> {
    const material = await this.crypto.subtle.importKey(
      "raw",
      sharedSecret,
      CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.keyDerivation,
      false,
      ["deriveKey"],
    );

    return this.crypto.subtle.deriveKey(
      {
        name: CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.keyDerivation,
        hash: CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.hash,
        salt,
        info: canonicalBytes({
          purpose: CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.hkdfInfoPurpose,
          context: projectDeclaredFields(
            context,
            CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.hkdfInfoContext,
          ),
        }),
      },
      material,
      {
        name: "AES-GCM",
        length: CURRENT_ALGORITHM_SUITE.vaultKeyWrapping.keyLengthBits,
      },
      false,
      ["encrypt", "decrypt"],
    );
  }

  private async wrapJson<Payload>(
    encodedPayload: unknown,
    protectionKey: ArrayBuffer,
    purpose: string,
  ): Promise<SerializedWrapped<Payload>> {
    const encrypted = await this.encryptJson(
      encodedPayload,
      protectionKey,
      CURRENT_ALGORITHM_SUITE.keyWrapping.nonceLengthBytes,
      purpose,
    );

    return {
      wrappedKey: encrypted.ciphertext,
      wrappingNonce: encrypted.encryptionNonce,
    };
  }

  private async unwrapJson<Payload>(
    wrapped: SerializedWrapped<Payload>,
    protectionKey: ArrayBuffer,
    purpose: string,
    decode: (value: unknown) => Payload,
    ErrorType: StaticErrorConstructor,
  ): Promise<Payload> {
    return this.decryptJson(
      {
        ciphertext: wrapped.wrappedKey,
        encryptionNonce: wrapped.wrappingNonce,
      },
      protectionKey,
      CURRENT_ALGORITHM_SUITE.keyWrapping.nonceLengthBytes,
      purpose,
      decode,
      ErrorType,
    );
  }

  private async encryptJson<Payload>(
    encodedPayload: unknown,
    rawKey: ArrayBuffer,
    nonceLength: number,
    purpose: string,
    context?: unknown,
  ): Promise<SerializedEncrypted<Payload>> {
    requireBufferLength(rawKey, AES_KEY_LENGTH_BYTES, "AES key");
    const key = await this.importAesKey(rawKey, ["encrypt"]);
    const plaintext = canonicalBytes(encodedPayload);

    try {
      return await this.encryptBytes(
        plaintext,
        key,
        nonceLength,
        canonicalBytes(
          context === undefined ? { purpose } : { purpose, context },
        ),
      );
    } finally {
      secureWipe(plaintext);
    }
  }

  private async decryptJson<Payload>(
    encrypted: SerializedEncrypted<Payload>,
    rawKey: ArrayBuffer,
    nonceLength: number,
    purpose: string,
    decode: (value: unknown) => Payload,
    ErrorType: StaticErrorConstructor,
    context?: unknown,
  ): Promise<Payload> {
    try {
      requireBufferLength(rawKey, AES_KEY_LENGTH_BYTES, "AES key");
      const key = await this.importAesKey(rawKey, ["decrypt"]);
      const plaintext = await this.decryptBytes(
        encrypted,
        key,
        nonceLength,
        canonicalBytes(
          context === undefined ? { purpose } : { purpose, context },
        ),
      );

      try {
        const parsed: unknown = JSON.parse(textDecoder.decode(plaintext));
        return decode(parsed);
      } finally {
        secureWipe(plaintext);
      }
    } catch (error) {
      if (error instanceof ErrorType) {
        throw error;
      }

      throw new ErrorType();
    }
  }

  private async encryptBytes<Payload>(
    plaintext: BufferSource,
    key: CryptoKey,
    nonceLength: number,
    additionalData: BufferSource,
  ): Promise<SerializedEncrypted<Payload>> {
    const nonce = new Uint8Array(nonceLength);
    this.crypto.getRandomValues(nonce);
    const ciphertext = await this.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: nonce,
        additionalData,
        tagLength: AES_GCM_TAG_LENGTH_BITS,
      },
      key,
      plaintext,
    );

    return {
      ciphertext: encodeBase64Url(new Uint8Array(ciphertext)),
      encryptionNonce: encodeBase64Url(nonce),
    };
  }

  private async decryptBytes(
    encrypted: SerializedEncrypted<unknown>,
    key: CryptoKey,
    nonceLength: number,
    additionalData: BufferSource,
  ): Promise<Uint8Array> {
    const nonce = ownedBytes(decodeBase64Url(encrypted.encryptionNonce));
    const ciphertext = ownedBytes(decodeBase64Url(encrypted.ciphertext));

    if (
      nonce.byteLength !== nonceLength ||
      ciphertext.byteLength < AES_GCM_TAG_LENGTH_BYTES
    ) {
      throw new Error("Encrypted artifact has an invalid byte length.");
    }

    const plaintext = await this.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: nonce,
        additionalData,
        tagLength: AES_GCM_TAG_LENGTH_BITS,
      },
      key,
      ciphertext,
    );

    return new Uint8Array(plaintext);
  }

  private async importAesKey(
    rawKey: ArrayBuffer,
    usages: readonly KeyUsage[],
  ): Promise<CryptoKey> {
    return this.crypto.subtle.importKey(
      "raw",
      rawKey,
      {
        name: "AES-GCM",
        length: CURRENT_ALGORITHM_SUITE.vaultMasterKeyGeneration.keyLengthBits,
      },
      false,
      [...usages],
    );
  }

  private async signCanonical<Payload>(
    payload: Payload,
    privateKey: DevicePrivateSignKey,
  ): Promise<SerializedSignatureOf<Payload>> {
    const importedKey = await this.importDeviceSignPrivateKey(privateKey);
    const signature = await this.crypto.subtle.sign(
      CURRENT_ALGORITHM_SUITE.signing.algorithm,
      importedKey,
      canonicalBytes(payload),
    );

    return { signature: encodeBase64Url(new Uint8Array(signature)) };
  }

  private async verifyCanonical<Payload>(
    payload: Payload,
    signature: SerializedSignatureOf<Payload>,
    publicKey: DevicePublicSignKey,
  ): Promise<boolean> {
    try {
      const signatureBytes = ownedBytes(decodeBase64Url(signature.signature));

      if (signatureBytes.byteLength !== ED25519_SIGNATURE_LENGTH_BYTES) {
        return false;
      }

      return this.crypto.subtle.verify(
        CURRENT_ALGORITHM_SUITE.signing.algorithm,
        await this.importDeviceSignPublicKey(publicKey),
        signatureBytes,
        canonicalBytes(payload),
      );
    } catch {
      return false;
    }
  }

  private async importDeviceSignPublicKey(
    publicKey: DevicePublicSignKey,
  ): Promise<CryptoKey> {
    return this.asymmetricKeyValidator.importDeviceSignPublicKey(publicKey);
  }

  private async importDeviceSignPrivateKey(
    privateKey: DevicePrivateSignKey,
  ): Promise<CryptoKey> {
    return this.asymmetricKeyValidator.importDeviceSignPrivateKey(privateKey);
  }

  private async importDeviceVaultPublicKey(
    publicKey: DeviceVaultPublicKey,
  ): Promise<CryptoKey> {
    return this.asymmetricKeyValidator.importDeviceVaultPublicKey(publicKey);
  }

  private async importDeviceVaultPrivateKey(
    privateKey: DeviceVaultPrivateKey,
  ): Promise<CryptoKey> {
    return this.asymmetricKeyValidator.importDeviceVaultPrivateKey(privateKey);
  }

  private async digestBytes(value: BufferSource): Promise<string> {
    const digest = await this.crypto.subtle.digest("SHA-256", value);
    return encodeBase64Url(new Uint8Array(digest));
  }
}

function projectDeclaredFields<
  Context extends object,
  Field extends Extract<keyof Context, string>,
>(context: Context, fields: readonly Field[]): Pick<Context, Field> {
  return Object.fromEntries(
    fields.map((field) => [field, context[field]]),
  ) as Pick<Context, Field>;
}

function canonicalBytes(value: unknown): Uint8Array<ArrayBuffer> {
  return ownedBytes(
    textEncoder.encode(canonicalize(toCanonicalJsonValue(value))),
  );
}

function toCanonicalJsonValue(value: unknown): CanonicalJsonValue {
  const converted = convertCanonicalJsonValue(value, false);

  if (converted === undefined) {
    throw new TypeError("A top-level undefined value cannot be canonicalized.");
  }

  return converted;
}

function convertCanonicalJsonValue(
  value: unknown,
  inArray: boolean,
): CanonicalJsonValue | undefined {
  if (value === undefined) {
    return inArray ? null : undefined;
  }

  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Non-finite numbers cannot be canonicalized.");
    }

    return value;
  }

  if (value instanceof ArrayBuffer) {
    return encodeBase64Url(new Uint8Array(value));
  }

  if (ArrayBuffer.isView(value)) {
    return encodeBase64Url(
      new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
    );
  }

  if (Array.isArray(value)) {
    return value.map((item) => {
      const converted = convertCanonicalJsonValue(item, true);
      return converted ?? null;
    });
  }

  if (typeof value === "object") {
    const result: Record<string, CanonicalJsonValue> = {};

    for (const [key, item] of Object.entries(value)) {
      const converted = convertCanonicalJsonValue(item, false);

      if (converted !== undefined) {
        result[key] = converted;
      }
    }

    return result;
  }

  throw new TypeError(
    `Unsupported canonical JSON value type: ${typeof value}.`,
  );
}

function copyBuffer(buffer: ArrayBuffer): ArrayBuffer {
  return buffer.slice(0);
}

function ownedBytes(
  value: ArrayBuffer | ArrayBufferView,
): Uint8Array<ArrayBuffer> {
  const source =
    value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  const result = new Uint8Array(source.byteLength);
  result.set(source);
  return result;
}

function requireBufferLength(
  buffer: ArrayBuffer | Uint8Array,
  expectedLength: number,
  label: string,
): void {
  if (buffer.byteLength !== expectedLength) {
    throw new RangeError(
      `${label} must contain exactly ${expectedLength} bytes.`,
    );
  }
}

function equalBytes(first: Uint8Array, second: Uint8Array): boolean {
  if (first.byteLength !== second.byteLength) {
    return false;
  }

  let difference = 0;

  for (let index = 0; index < first.byteLength; index += 1) {
    difference |= first[index]! ^ second[index]!;
  }

  return difference === 0;
}
