import { describe, it, expect } from "vitest";
import { WebCryptoApiAdapter } from "./web-crypto-api.adapter";
import { CRYPTO_PROFILE_V1 } from "@/core/crypto/profiles/crypto-profile.const";
import { asVaultKey } from "@/core/crypto/keys/crypto-keys.type";

const profile = CRYPTO_PROFILE_V1;

describe("WebCryptoApiAdapter", () => {
  describe("deriveKey", () => {
    it("derives a key that can wrap and unwrap consistently", async () => {
      const password = new TextEncoder().encode("test-password");
      const salt = WebCryptoApiAdapter.generateSalt();

      const { masterKEK } = await WebCryptoApiAdapter.deriveKey(
        profile,
        password,
        salt,
      );

      const vaultKey = await WebCryptoApiAdapter.generateVaultKey(profile);
      const wrapped = await WebCryptoApiAdapter.wrapKey(
        profile,
        "raw",
        vaultKey,
        masterKEK,
      );
      const unwrapped = await WebCryptoApiAdapter.unwrapKey(
        profile,
        "raw",
        wrapped,
        masterKEK,
        { name: "AES-GCM", length: 256 } as AesKeyGenParams,
        true,
        ["encrypt", "decrypt"],
      );

      expect(unwrapped.algorithm.name).toBe("AES-GCM");
    });

    it("produces different wrapping results with different salts", async () => {
      const password = new TextEncoder().encode("same-password");
      const salt1 = WebCryptoApiAdapter.generateSalt();
      const salt2 = WebCryptoApiAdapter.generateSalt();

      const { masterKEK: kek1 } = await WebCryptoApiAdapter.deriveKey(
        profile,
        password,
        salt1,
      );
      const { masterKEK: kek2 } = await WebCryptoApiAdapter.deriveKey(
        profile,
        password,
        salt2,
      );

      const vaultKey = await WebCryptoApiAdapter.generateVaultKey(profile);

      const wrapped1 = await WebCryptoApiAdapter.wrapKey(
        profile,
        "raw",
        vaultKey,
        kek1,
      );
      const wrapped2 = await WebCryptoApiAdapter.wrapKey(
        profile,
        "raw",
        vaultKey,
        kek2,
      );

      expect(new Uint8Array(wrapped1)).not.toEqual(new Uint8Array(wrapped2));
    });
  });

  describe("generateSalt", () => {
    it("generates 32 bytes by default", () => {
      const salt = WebCryptoApiAdapter.generateSalt();
      expect(salt.byteLength).toBe(32);
    });

    it("generates custom length", () => {
      const salt = WebCryptoApiAdapter.generateSalt(64);
      expect(salt.byteLength).toBe(64);
    });
  });

  describe("generateIV", () => {
    it("generates 12 bytes", () => {
      const iv = WebCryptoApiAdapter.generateIV();
      expect(iv.byteLength).toBe(12);
    });
  });

  describe("generateVaultKey", () => {
    it("returns a CryptoKey with AES-GCM algorithm", async () => {
      const key = await WebCryptoApiAdapter.generateVaultKey(profile);
      expect(key.algorithm.name).toBe("AES-GCM");
      expect((key.algorithm as AesKeyAlgorithm).length).toBe(256);
    });
  });

  describe("encrypt / decrypt", () => {
    it("round-trips plaintext correctly", async () => {
      const key = await WebCryptoApiAdapter.generateVaultKey(profile);
      const plaintext = new TextEncoder().encode("hello, vault!");

      const encrypted = await WebCryptoApiAdapter.encrypt(
        profile,
        plaintext,
        key,
      );
      const decrypted = await WebCryptoApiAdapter.decrypt(
        profile,
        encrypted,
        key,
      );

      expect(new Uint8Array(decrypted)).toEqual(plaintext);
    });

    it("produces different nonces for the same data", async () => {
      const key = await WebCryptoApiAdapter.generateVaultKey(profile);
      const plaintext = new TextEncoder().encode("same data");

      const enc1 = await WebCryptoApiAdapter.encrypt(profile, plaintext, key);
      const enc2 = await WebCryptoApiAdapter.encrypt(profile, plaintext, key);

      expect(enc1.nonce).not.toBe(enc2.nonce);
    });

    it("decrypts with correct AAD", async () => {
      const key = await WebCryptoApiAdapter.generateVaultKey(profile);
      const plaintext = new TextEncoder().encode("aad-protected");
      const aad = new TextEncoder().encode("context-binding");

      const encrypted = await WebCryptoApiAdapter.encrypt(
        profile,
        plaintext,
        key,
        aad,
      );
      const decrypted = await WebCryptoApiAdapter.decrypt(
        profile,
        encrypted,
        key,
        aad,
      );

      expect(new Uint8Array(decrypted)).toEqual(plaintext);
    });

    it("throws with wrong AAD", async () => {
      const key = await WebCryptoApiAdapter.generateVaultKey(profile);
      const plaintext = new TextEncoder().encode("aad-protected");
      const correctAad = new TextEncoder().encode("correct");
      const wrongAad = new TextEncoder().encode("wrong");

      const encrypted = await WebCryptoApiAdapter.encrypt(
        profile,
        plaintext,
        key,
        correctAad,
      );

      await expect(
        WebCryptoApiAdapter.decrypt(profile, encrypted, key, wrongAad),
      ).rejects.toThrow();
    });

    it("throws when AAD is missing but was used during encryption", async () => {
      const key = await WebCryptoApiAdapter.generateVaultKey(profile);
      const plaintext = new TextEncoder().encode("aad-protected");
      const aad = new TextEncoder().encode("context");

      const encrypted = await WebCryptoApiAdapter.encrypt(
        profile,
        plaintext,
        key,
        aad,
      );

      await expect(
        WebCryptoApiAdapter.decrypt(profile, encrypted, key),
      ).rejects.toThrow();
    });
  });

  describe("hash", () => {
    it("produces correct SHA-256 for empty input", async () => {
      const result = await WebCryptoApiAdapter.hash(profile, new Uint8Array(0));
      const hex = Array.from(new Uint8Array(result))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      expect(hex).toBe(
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      );
    });

    it("produces correct SHA-256 for 'abc'", async () => {
      const result = await WebCryptoApiAdapter.hash(
        profile,
        new TextEncoder().encode("abc"),
      );
      const hex = Array.from(new Uint8Array(result))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      expect(hex).toBe(
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      );
    });
  });

  describe("wrapKey / unwrapKey", () => {
    it("round-trips a vault key", async () => {
      const password = new TextEncoder().encode("wrap-test");
      const salt = WebCryptoApiAdapter.generateSalt();
      const { masterKEK } = await WebCryptoApiAdapter.deriveKey(
        profile,
        password,
        salt,
      );

      const vaultKey = await WebCryptoApiAdapter.generateVaultKey(profile);

      const wrapped = await WebCryptoApiAdapter.wrapKey(
        profile,
        "raw",
        vaultKey,
        masterKEK,
      );
      const unwrapped = await WebCryptoApiAdapter.unwrapKey(
        profile,
        "raw",
        wrapped,
        masterKEK,
        { name: "AES-GCM", length: 256 } as AesKeyGenParams,
        true,
        ["encrypt", "decrypt"],
      );

      // Verify the unwrapped key works for encryption/decryption
      const plaintext = new TextEncoder().encode("wrap-unwrap test");
      const unwrappedVaultKey = asVaultKey(unwrapped);
      const encrypted = await WebCryptoApiAdapter.encrypt(
        profile,
        plaintext,
        unwrappedVaultKey,
      );
      const decrypted = await WebCryptoApiAdapter.decrypt(
        profile,
        encrypted,
        unwrappedVaultKey,
      );

      expect(new Uint8Array(decrypted)).toEqual(plaintext);
    });

    it("wrapped output is 60 bytes for a raw AES-256 key (12 IV + 32 key + 16 tag)", async () => {
      const password = new TextEncoder().encode("size-test");
      const salt = WebCryptoApiAdapter.generateSalt();
      const { masterKEK } = await WebCryptoApiAdapter.deriveKey(
        profile,
        password,
        salt,
      );

      const vaultKey = await WebCryptoApiAdapter.generateVaultKey(profile);
      const wrapped = await WebCryptoApiAdapter.wrapKey(
        profile,
        "raw",
        vaultKey,
        masterKEK,
      );

      expect(wrapped.byteLength).toBe(60);
    });

    it("wrapping same key twice produces different bytes (random IV)", async () => {
      const password = new TextEncoder().encode("iv-test");
      const salt = WebCryptoApiAdapter.generateSalt();
      const { masterKEK } = await WebCryptoApiAdapter.deriveKey(
        profile,
        password,
        salt,
      );

      const vaultKey = await WebCryptoApiAdapter.generateVaultKey(profile);
      const wrapped1 = await WebCryptoApiAdapter.wrapKey(
        profile,
        "raw",
        vaultKey,
        masterKEK,
      );
      const wrapped2 = await WebCryptoApiAdapter.wrapKey(
        profile,
        "raw",
        vaultKey,
        masterKEK,
      );

      expect(new Uint8Array(wrapped1)).not.toEqual(new Uint8Array(wrapped2));
    });
  });
});
