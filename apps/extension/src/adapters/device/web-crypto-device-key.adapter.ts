/**
 * WebCrypto device key adapter.
 *
 * Implements `DeviceKeyPort` using the WebCrypto API for:
 * - Ed25519 signing (device identity / vault signatures)
 * - ECDH P-256 key agreement (device key slot derivation)
 *
 * Key lifecycle:
 * 1. `generateKeys` — fresh extractable key pairs (extractable so wrapKey works)
 * 2. `wrapPrivateKeys` — AES-256-GCM (A256GCMKW) wrap for IndexedDB persistence
 * 3. `unwrapPrivateKeys` — restore with `extractable: false` (runtime security)
 *
 * Each wrapped key buffer contains: `IV (12 bytes) || ciphertext+tag`.
 * Critical: each private key gets its own random IV — reusing an IV under the
 * same key breaks AES-GCM.
 *
 * @see docs/security/security-specification.md §3.5, §4.2
 */

import type { DeviceKeyPort } from "@/core/device/device-key.port";
import type { CryptoProfile } from "@/core/crypto/profiles/crypto-profile.type";
import type { MasterKEK } from "@/core/crypto/keys/crypto-keys.type";
import type {
  DeviceKeys,
  DevicePublicKeysJwk,
  WrappedDeviceKeys,
} from "@/core/device/device-key.type";
import {
  asSigningPrivateKey,
  asSigningPublicKey,
  asAgreementPrivateKey,
  asAgreementPublicKey,
} from "@/core/crypto/keys/crypto-keys.type";
import { buildKeyWrapParams } from "@/core/crypto/algorithms/key-wrap.params";
import { AES_GCM_IV_LENGTH_BYTES } from "@/core/crypto/crypto.const";
import { resolveAlgorithmSuite } from "@/core/crypto/suites/algorithm-suite.registry";
import { resolveSerializationSuite } from "@/core/crypto/formats/serialization-suite.registry";

/** Prepend a random IV to wrapped key bytes. */
function prependIv(iv: Uint8Array, wrapped: ArrayBuffer): ArrayBuffer {
  const result = new Uint8Array(iv.byteLength + wrapped.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(wrapped), iv.byteLength);
  return result.buffer;
}

/** Split IV prefix from wrapped key bytes. */
function splitIv(data: ArrayBuffer): {
  iv: Uint8Array<ArrayBuffer>;
  ciphertext: ArrayBuffer;
} {
  const bytes = new Uint8Array(data);
  const iv = new Uint8Array(AES_GCM_IV_LENGTH_BYTES);
  iv.set(bytes.subarray(0, AES_GCM_IV_LENGTH_BYTES));
  const ciphertext = bytes.slice(AES_GCM_IV_LENGTH_BYTES).buffer as ArrayBuffer;
  return { iv, ciphertext };
}

export const WebCryptoDeviceKeyAdapter: DeviceKeyPort = {
  async generateKeys(profile: CryptoProfile): Promise<DeviceKeys> {
    const suite = resolveAlgorithmSuite(profile.algorithmSuiteId);

    const signingPair = await crypto.subtle.generateKey(
      suite.signing.algorithm,
      true,
      ["sign", "verify"],
    );

    const agreementPair = await crypto.subtle.generateKey(
      suite.keyExchange.algorithm,
      true,
      ["deriveKey", "deriveBits"],
    );

    return {
      suiteId: suite.id,
      signing: {
        publicKey: asSigningPublicKey(signingPair.publicKey),
        privateKey: asSigningPrivateKey(signingPair.privateKey),
      },
      agreement: {
        publicKey: asAgreementPublicKey(agreementPair.publicKey),
        privateKey: asAgreementPrivateKey(agreementPair.privateKey),
      },
    };
  },

  async exportPublicKeysJwk(
    profile: CryptoProfile,
    keys: DeviceKeys,
  ): Promise<DevicePublicKeysJwk> {
    const suite = resolveAlgorithmSuite(profile.algorithmSuiteId);

    const [signingPublicJwk, agreementPublicJwk] = await Promise.all([
      crypto.subtle.exportKey("jwk", keys.signing.publicKey),
      crypto.subtle.exportKey("jwk", keys.agreement.publicKey),
    ]);

    return {
      suiteId: suite.id,
      signingPublicJwk,
      agreementPublicJwk,
    };
  },

  async wrapPrivateKeys(
    profile: CryptoProfile,
    keys: DeviceKeys,
    masterKEK: MasterKEK,
  ): Promise<WrappedDeviceKeys> {
    const suite = resolveAlgorithmSuite(profile.algorithmSuiteId);
    const serialization = resolveSerializationSuite(
      profile.serializationSuiteId,
    );

    const signingIv = new Uint8Array(AES_GCM_IV_LENGTH_BYTES);
    crypto.getRandomValues(signingIv);
    const agreementIv = new Uint8Array(AES_GCM_IV_LENGTH_BYTES);
    crypto.getRandomValues(agreementIv);

    const [
      rawWrappedSigning,
      rawWrappedAgreement,
      signingPublicKeyBytes,
      agreementPublicKeyBytes,
    ] = await Promise.all([
      crypto.subtle.wrapKey(
        serialization.deviceKeys.signingPrivate,
        keys.signing.privateKey,
        masterKEK,
        buildKeyWrapParams(suite.keyWrap, signingIv),
      ),
      crypto.subtle.wrapKey(
        serialization.deviceKeys.agreementPrivate,
        keys.agreement.privateKey,
        masterKEK,
        buildKeyWrapParams(suite.keyWrap, agreementIv),
      ),
      crypto.subtle.exportKey(
        serialization.deviceKeys.signingPublic,
        keys.signing.publicKey,
      ),
      crypto.subtle.exportKey(
        serialization.deviceKeys.agreementPublic,
        keys.agreement.publicKey,
      ),
    ]);

    return {
      suiteId: suite.id,
      wrappedSigningPrivateKey: prependIv(signingIv, rawWrappedSigning),
      wrappedAgreementPrivateKey: prependIv(agreementIv, rawWrappedAgreement),
      signingPublicKeyBytes,
      agreementPublicKeyBytes,
    };
  },

  async unwrapPrivateKeys(
    profile: CryptoProfile,
    wrapped: WrappedDeviceKeys,
    masterKEK: MasterKEK,
  ): Promise<DeviceKeys> {
    const suite = resolveAlgorithmSuite(profile.algorithmSuiteId);
    const serialization = resolveSerializationSuite(
      profile.serializationSuiteId,
    );

    const signing = splitIv(wrapped.wrappedSigningPrivateKey);
    const agreement = splitIv(wrapped.wrappedAgreementPrivateKey);

    const [
      signingPrivateKey,
      agreementPrivateKey,
      signingPublicKey,
      agreementPublicKey,
    ] = await Promise.all([
      crypto.subtle.unwrapKey(
        serialization.deviceKeys.signingPrivate,
        signing.ciphertext,
        masterKEK,
        buildKeyWrapParams(suite.keyWrap, signing.iv),
        suite.signing.algorithm,
        false,
        ["sign"],
      ),
      crypto.subtle.unwrapKey(
        serialization.deviceKeys.agreementPrivate,
        agreement.ciphertext,
        masterKEK,
        buildKeyWrapParams(suite.keyWrap, agreement.iv),
        suite.keyExchange.algorithm,
        false,
        ["deriveKey", "deriveBits"],
      ),
      crypto.subtle.importKey(
        serialization.deviceKeys.signingPublic,
        wrapped.signingPublicKeyBytes,
        suite.signing.algorithm,
        true,
        ["verify"],
      ),
      crypto.subtle.importKey(
        serialization.deviceKeys.agreementPublic,
        wrapped.agreementPublicKeyBytes,
        suite.keyExchange.algorithm,
        true,
        [],
      ),
    ]);

    return {
      suiteId: suite.id,
      signing: {
        publicKey: asSigningPublicKey(signingPublicKey),
        privateKey: asSigningPrivateKey(signingPrivateKey),
      },
      agreement: {
        publicKey: asAgreementPublicKey(agreementPublicKey),
        privateKey: asAgreementPrivateKey(agreementPrivateKey),
      },
    };
  },

  async sign(
    profile: CryptoProfile,
    data: BufferSource,
    keys: DeviceKeys,
  ): Promise<Uint8Array> {
    const suite = resolveAlgorithmSuite(profile.algorithmSuiteId);

    const signature = await crypto.subtle.sign(
      suite.signing.algorithm,
      keys.signing.privateKey,
      data,
    );
    return new Uint8Array(signature);
  },

  async verify(
    profile: CryptoProfile,
    data: BufferSource,
    signature: BufferSource,
    signingPublicJwk: JsonWebKey,
  ): Promise<boolean> {
    const suite = resolveAlgorithmSuite(profile.algorithmSuiteId);

    const publicKey = await crypto.subtle.importKey(
      "jwk",
      signingPublicJwk,
      suite.signing.algorithm,
      true,
      ["verify"],
    );

    return crypto.subtle.verify(
      suite.signing.algorithm,
      publicKey,
      signature,
      data,
    );
  },

  /**
   * Derive raw shared secret via key agreement.
   *
   * WARNING: The returned bytes are raw key agreement output. Per spec §3.6,
   * the caller MUST apply a KDF (HKDF or ConcatKDF) before using as an
   * AES key or for any other symmetric purpose.
   */
  async deriveSharedSecret(
    profile: CryptoProfile,
    keys: DeviceKeys,
    remoteAgreementPublicJwk: JsonWebKey,
  ): Promise<Uint8Array> {
    const suite = resolveAlgorithmSuite(profile.algorithmSuiteId);

    const remotePublicKey = await crypto.subtle.importKey(
      "jwk",
      remoteAgreementPublicJwk,
      suite.keyExchange.algorithm,
      true,
      [],
    );

    const secretBits = await crypto.subtle.deriveBits(
      { name: suite.keyExchange.algorithm.name, public: remotePublicKey },
      keys.agreement.privateKey,
      256,
    );

    return new Uint8Array(secretBits);
  },
};
