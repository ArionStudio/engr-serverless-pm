import type {
  CryptoPort,
  KeyDerivationResult,
} from "../../core/crypto/crypto.port";
import type { VaultKey } from "../../core/crypto/keys/crypto-keys.type";
import {
  asMasterKEK,
  asVaultKey,
} from "../../core/crypto/keys/crypto-keys.type";
import type { KeyFormat } from "../../core/crypto/formats/key-format.type";
import type { EncryptedDataPayload } from "../../core/vault/encrypted-payload.type";
import type { CryptoProfile } from "../../core/crypto/profiles/crypto-profile.type";
import { resolveAlgorithmSuite } from "../../core/crypto/suites/algorithm-suite.registry";
import {
  buildSuiteKdfDeriveKeyParams,
  buildSuiteKeyWrapParams,
  buildSuiteSymmetricParams,
} from "../../core/crypto/suites/algorithm-suite.helpers";
import { AES_GCM_IV_LENGTH_BYTES } from "../../core/crypto/crypto.const";
import { decodeBase64Url, encodeBase64Url } from "@/lib/base64Url.utils";

/**
 * WebCrypto crypto adapter.
 *
 * Implements `CryptoPort` using the WebCrypto API.
 *
 * Notes:
 * - Algorithms are selected by resolving `profile.algorithmSuiteId`.
 * - Encrypted payloads are algorithm-agnostic; algorithm selection comes from
 *   the caller's chosen profile/suite.
 */
export const WebCryptoApiAdapter: CryptoPort = {
  async deriveKey(
    profile: CryptoProfile,
    password: BufferSource,
    salt: BufferSource,
  ): Promise<KeyDerivationResult> {
    const suite = resolveAlgorithmSuite(profile.algorithmSuiteId);

    const baseKey = await crypto.subtle.importKey(
      "raw",
      password,
      suite.kdf.importAlgorithm,
      false,
      ["deriveKey"],
    );

    const derivedKey = await crypto.subtle.deriveKey(
      buildSuiteKdfDeriveKeyParams(suite, salt),
      baseKey,
      suite.keyWrap.keyGen,
      false,
      ["wrapKey", "unwrapKey"],
    );

    return { masterKEK: asMasterKEK(derivedKey), salt };
  },

  async generateVaultKey(profile: CryptoProfile): Promise<VaultKey> {
    const suite = resolveAlgorithmSuite(profile.algorithmSuiteId);

    const generatedKey = await crypto.subtle.generateKey(
      suite.symmetric.keyGen,
      true,
      ["encrypt", "decrypt"],
    );

    return asVaultKey(generatedKey);
  },

  async encrypt(
    profile: CryptoProfile,
    data: BufferSource,
    key: VaultKey,
    aad?: BufferSource,
  ): Promise<EncryptedDataPayload> {
    const suite = resolveAlgorithmSuite(profile.algorithmSuiteId);

    const nonce = WebCryptoApiAdapter.generateIV();
    const ciphertext = await crypto.subtle.encrypt(
      buildSuiteSymmetricParams(suite, nonce, aad),
      key,
      data,
    );

    return {
      nonce: encodeBase64Url(new Uint8Array(nonce)),
      ciphertext: encodeBase64Url(new Uint8Array(ciphertext)),
    };
  },

  async decrypt(
    profile: CryptoProfile,
    payload: EncryptedDataPayload,
    key: VaultKey,
    aad?: BufferSource,
  ): Promise<ArrayBuffer> {
    const suite = resolveAlgorithmSuite(profile.algorithmSuiteId);

    const nonce = decodeBase64Url(payload.nonce);
    const ciphertext = decodeBase64Url(payload.ciphertext);

    return crypto.subtle.decrypt(
      buildSuiteSymmetricParams(suite, nonce, aad),
      key,
      ciphertext,
    );
  },

  generateSalt(length = 32): ArrayBuffer {
    const salt = new Uint8Array(length);
    crypto.getRandomValues(salt);
    return salt.buffer;
  },

  generateIV(): ArrayBuffer {
    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);
    return iv.buffer;
  },

  async hash(profile: CryptoProfile, data: BufferSource): Promise<ArrayBuffer> {
    const suite = resolveAlgorithmSuite(profile.algorithmSuiteId);
    return crypto.subtle.digest(suite.hashing.name, data);
  },

  async wrapKey(
    profile: CryptoProfile,
    format: KeyFormat,
    keyToWrap: CryptoKey,
    wrappingKey: CryptoKey,
  ): Promise<ArrayBuffer> {
    const suite = resolveAlgorithmSuite(profile.algorithmSuiteId);

    const iv = new Uint8Array(AES_GCM_IV_LENGTH_BYTES);
    crypto.getRandomValues(iv);

    const wrapped = await crypto.subtle.wrapKey(
      format,
      keyToWrap,
      wrappingKey,
      buildSuiteKeyWrapParams(suite, iv),
    );

    const result = new Uint8Array(iv.byteLength + wrapped.byteLength);
    result.set(iv, 0);
    result.set(new Uint8Array(wrapped), iv.byteLength);
    return result.buffer;
  },

  async unwrapKey(
    profile: CryptoProfile,
    format: KeyFormat,
    wrappedKey: ArrayBuffer,
    unwrappingKey: CryptoKey,
    algorithm: AlgorithmIdentifier,
    extractable: boolean,
    keyUsages: KeyUsage[],
  ): Promise<CryptoKey> {
    const suite = resolveAlgorithmSuite(profile.algorithmSuiteId);

    const data = new Uint8Array(wrappedKey);
    const iv = new Uint8Array(AES_GCM_IV_LENGTH_BYTES);
    iv.set(data.subarray(0, AES_GCM_IV_LENGTH_BYTES));
    const ciphertext = data.slice(AES_GCM_IV_LENGTH_BYTES)
      .buffer as ArrayBuffer;

    return crypto.subtle.unwrapKey(
      format,
      ciphertext,
      unwrappingKey,
      buildSuiteKeyWrapParams(suite, iv),
      algorithm,
      extractable,
      keyUsages,
    );
  },
};
