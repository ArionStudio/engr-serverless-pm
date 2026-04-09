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

/**
 * PBKDF2-HMAC-SHA256 test vectors from RFC 7914, Appendix B.
 *
 * These test crypto.subtle.deriveBits() directly because the adapter's
 * deriveKey() returns a non-extractable CryptoKey (raw bytes can't be read).
 */
describe("PBKDF2 standard test vectors (RFC 7914 Appendix B)", () => {
  const hexFromBytes = (bytes: Uint8Array): string =>
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  it('P="passwd", S="salt", c=1, dkLen=64', async () => {
    const password = new TextEncoder().encode("passwd");
    const salt = new TextEncoder().encode("salt");

    const baseKey = await crypto.subtle.importKey(
      "raw",
      password,
      { name: "PBKDF2" },
      false,
      ["deriveBits"],
    );

    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: 1, hash: "SHA-256" },
      baseKey,
      64 * 8,
    );

    expect(hexFromBytes(new Uint8Array(bits))).toBe(
      "55ac046e56e3089fec1691c22544b605" +
        "f94185216dde0465e68b9d57c20dacbc" +
        "49ca9cccf179b645991664b39d77ef31" +
        "7c71b845b1e30bd509112041d3a19783",
    );
  });

  it('P="Password", S="NaCl", c=80000, dkLen=64', async () => {
    const password = new TextEncoder().encode("Password");
    const salt = new TextEncoder().encode("NaCl");

    const baseKey = await crypto.subtle.importKey(
      "raw",
      password,
      { name: "PBKDF2" },
      false,
      ["deriveBits"],
    );

    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: 80_000, hash: "SHA-256" },
      baseKey,
      64 * 8,
    );

    expect(hexFromBytes(new Uint8Array(bits))).toBe(
      "4ddcd8f60b98be21830cee5ef22701f9" +
        "641a4418d04c0414aeff08876b34ab56" +
        "a1d425a1225833549adb841b51c9b317" +
        "6a272bdebba1d078478f62b397f33c8d",
    );
  });
});

/**
 * AES-256-GCM test vector from NIST SP 800-38D, Test Case 16.
 *
 * Uses crypto.subtle directly because the adapter generates a random IV
 * internally — can't use it for deterministic vector testing.
 *
 * Test Case 16: 256-bit key, 96-bit IV, 128-bit tag.
 */
describe("AES-256-GCM standard test vectors (NIST SP 800-38D)", () => {
  const fromHex = (hex: string): ArrayBuffer => {
    const bytes = hex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16));
    return new Uint8Array(bytes).buffer as ArrayBuffer;
  };

  // NIST SP 800-38D, Test Case 16
  const TC16_KEY = fromHex(
    "feffe9928665731c6d6a8f9467308308feffe9928665731c6d6a8f9467308308",
  );
  const TC16_IV = fromHex("cafebabefacedbaddecaf888");
  const TC16_PLAINTEXT = fromHex(
    "d9313225f88406e5a55909c5aff5269a" +
      "86a7a9531534f7da2e4c303d8a318a72" +
      "1c3c0c95956809532fcf0e2449a6b525" +
      "b16aedf5aa0de657ba637b39",
  );
  const TC16_AAD = fromHex("feedfacedeadbeeffeedfacedeadbeefabaddad2");
  const TC16_CIPHERTEXT = fromHex(
    "522dc1f099567d07f47f37a32a84427d" +
      "643a8cdcbfe5c0c97598a2bd2555d1aa" +
      "8cb08e48590dbb3da7b08b1056828838" +
      "c5f61e6393ba7a0abcc9f662",
  );
  const TC16_TAG = fromHex("76fc6ece0f4e1768cddf8853bb2d551b");

  it("encrypts to expected ciphertext + tag", async () => {
    const key = await crypto.subtle.importKey(
      "raw",
      TC16_KEY,
      { name: "AES-GCM" },
      false,
      ["encrypt"],
    );

    const result = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: TC16_IV,
        additionalData: TC16_AAD,
        tagLength: 128,
      },
      key,
      TC16_PLAINTEXT,
    );

    // WebCrypto appends the tag to the ciphertext
    const output = new Uint8Array(result);
    const expectedCiphertext = new Uint8Array(TC16_CIPHERTEXT);
    const expectedTag = new Uint8Array(TC16_TAG);
    const ciphertext = output.slice(0, expectedCiphertext.length);
    const tag = output.slice(expectedCiphertext.length);

    expect(ciphertext).toEqual(expectedCiphertext);
    expect(tag).toEqual(expectedTag);
  });

  it("decrypts to expected plaintext", async () => {
    const key = await crypto.subtle.importKey(
      "raw",
      TC16_KEY,
      { name: "AES-GCM" },
      false,
      ["decrypt"],
    );

    // WebCrypto expects ciphertext + tag concatenated
    const ct = new Uint8Array(TC16_CIPHERTEXT);
    const tag = new Uint8Array(TC16_TAG);
    const ciphertextWithTag = new Uint8Array(ct.length + tag.length);
    ciphertextWithTag.set(ct, 0);
    ciphertextWithTag.set(tag, ct.length);

    const result = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: TC16_IV,
        additionalData: TC16_AAD,
        tagLength: 128,
      },
      key,
      ciphertextWithTag.buffer as ArrayBuffer,
    );

    expect(new Uint8Array(result)).toEqual(new Uint8Array(TC16_PLAINTEXT));
  });
});

/**
 * Key memory safety tests.
 *
 * Verify that the adapter produces keys with correct extractability
 * and usage constraints — the crypto-level guardrails that ensure
 * the Vault Key is never persisted.
 */
describe("key memory safety", () => {
  it("MasterKEK is non-extractable", async () => {
    const password = new TextEncoder().encode("test-password");
    const salt = WebCryptoApiAdapter.generateSalt();
    const { masterKEK } = await WebCryptoApiAdapter.deriveKey(
      profile,
      password,
      salt,
    );

    expect(masterKEK.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("raw", masterKEK)).rejects.toThrow();
  });

  it("MasterKEK only has wrapping usages", async () => {
    const password = new TextEncoder().encode("test-password");
    const salt = WebCryptoApiAdapter.generateSalt();
    const { masterKEK } = await WebCryptoApiAdapter.deriveKey(
      profile,
      password,
      salt,
    );

    expect([...masterKEK.usages].sort()).toEqual(["unwrapKey", "wrapKey"]);
  });

  it("VaultKey is extractable only for wrapping", async () => {
    const vaultKey = await WebCryptoApiAdapter.generateVaultKey(profile);

    // Must be extractable so wrapKey("raw", ...) can read it
    expect(vaultKey.extractable).toBe(true);
    // But limited to encrypt/decrypt — cannot be used for wrapping
    expect([...vaultKey.usages].sort()).toEqual(["decrypt", "encrypt"]);
  });
});
