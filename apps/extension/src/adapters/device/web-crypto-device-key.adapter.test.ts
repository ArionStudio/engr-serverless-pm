import { describe, it, expect } from "vitest";
import { WebCryptoDeviceKeyAdapter } from "./web-crypto-device-key.adapter";
import { WebCryptoApiAdapter } from "@/adapters/crypto/web-crypto-api.adapter";
import { CRYPTO_PROFILE_V1 } from "@/old-core/crypto/profiles/crypto-profile.const";

const profile = CRYPTO_PROFILE_V1;

/**
 * Helper: derive a MasterKEK for wrapping tests.
 */
async function createMasterKEK() {
  const password = new TextEncoder().encode("device-key-test-password");
  const salt = WebCryptoApiAdapter.generateSalt();
  const { masterKEK } = await WebCryptoApiAdapter.deriveKey(
    profile,
    password,
    salt,
  );
  return masterKEK;
}

describe("WebCryptoDeviceKeyAdapter", () => {
  describe("generateKeys", () => {
    it("generates keys with correct algorithm names", async () => {
      const keys = await WebCryptoDeviceKeyAdapter.generateKeys(profile);

      expect(keys.signing.privateKey.algorithm.name).toBe("Ed25519");
      expect(keys.signing.publicKey.algorithm.name).toBe("Ed25519");
      expect(keys.agreement.privateKey.algorithm.name).toBe("ECDH");
      expect(keys.agreement.publicKey.algorithm.name).toBe("ECDH");
    });

    it("generates extractable signing private key (required for wrapKey)", async () => {
      const keys = await WebCryptoDeviceKeyAdapter.generateKeys(profile);
      expect(keys.signing.privateKey.extractable).toBe(true);
    });
  });

  describe("exportPublicKeys", () => {
    it('exports signing public key in the profile-defined "raw" format', async () => {
      const keys = await WebCryptoDeviceKeyAdapter.generateKeys(profile);
      const exported = await WebCryptoDeviceKeyAdapter.exportPublicKeys(
        profile,
        keys,
      );

      expect(exported.signing.format).toBe("raw");
      expect(exported.signing.data.byteLength).toBeGreaterThan(0);
    });

    it('exports agreement public key in the profile-defined "spki" format', async () => {
      const keys = await WebCryptoDeviceKeyAdapter.generateKeys(profile);
      const exported = await WebCryptoDeviceKeyAdapter.exportPublicKeys(
        profile,
        keys,
      );

      expect(exported.agreement.format).toBe("spki");
      expect(exported.agreement.data.byteLength).toBeGreaterThan(0);
    });
  });

  describe("sign / verify", () => {
    it("round-trips: sign then verify succeeds", async () => {
      const keys = await WebCryptoDeviceKeyAdapter.generateKeys(profile);
      const exported = await WebCryptoDeviceKeyAdapter.exportPublicKeys(
        profile,
        keys,
      );
      const data = new TextEncoder().encode("sign-verify test");

      const signature = await WebCryptoDeviceKeyAdapter.sign(
        profile,
        data,
        keys,
      );
      const valid = await WebCryptoDeviceKeyAdapter.verify(
        profile,
        data,
        signature as BufferSource,
        exported.signing,
      );

      expect(valid).toBe(true);
    });

    it("fails verification with different data", async () => {
      const keys = await WebCryptoDeviceKeyAdapter.generateKeys(profile);
      const exported = await WebCryptoDeviceKeyAdapter.exportPublicKeys(
        profile,
        keys,
      );
      const data = new TextEncoder().encode("original data");
      const tampered = new TextEncoder().encode("tampered data");

      const signature = await WebCryptoDeviceKeyAdapter.sign(
        profile,
        data,
        keys,
      );
      const valid = await WebCryptoDeviceKeyAdapter.verify(
        profile,
        tampered,
        signature as BufferSource,
        exported.signing,
      );

      expect(valid).toBe(false);
    });

    it("fails verification with a different key", async () => {
      const keys1 = await WebCryptoDeviceKeyAdapter.generateKeys(profile);
      const keys2 = await WebCryptoDeviceKeyAdapter.generateKeys(profile);
      const exported2 = await WebCryptoDeviceKeyAdapter.exportPublicKeys(
        profile,
        keys2,
      );
      const data = new TextEncoder().encode("wrong key test");

      const signature = await WebCryptoDeviceKeyAdapter.sign(
        profile,
        data,
        keys1,
      );
      const valid = await WebCryptoDeviceKeyAdapter.verify(
        profile,
        data,
        signature as BufferSource,
        exported2.signing,
      );

      expect(valid).toBe(false);
    });
  });

  describe("wrapPrivateKeys / unwrapPrivateKeys", () => {
    it("round-trips: wrap → unwrap → sign → verify with original exported public key", async () => {
      const masterKEK = await createMasterKEK();
      const keys = await WebCryptoDeviceKeyAdapter.generateKeys(profile);
      const exported = await WebCryptoDeviceKeyAdapter.exportPublicKeys(
        profile,
        keys,
      );

      const wrapped = await WebCryptoDeviceKeyAdapter.wrapPrivateKeys(
        profile,
        keys,
        masterKEK,
      );
      const restored = await WebCryptoDeviceKeyAdapter.unwrapPrivateKeys(
        profile,
        wrapped,
        masterKEK,
      );

      // Sign with restored keys, verify with original exported public key
      const data = new TextEncoder().encode("wrap-unwrap round-trip");
      const signature = await WebCryptoDeviceKeyAdapter.sign(
        profile,
        data,
        restored,
      );
      const valid = await WebCryptoDeviceKeyAdapter.verify(
        profile,
        data,
        signature as BufferSource,
        exported.signing,
      );

      expect(valid).toBe(true);
    });

    it("unwrapped signing private key is non-extractable", async () => {
      const masterKEK = await createMasterKEK();
      const keys = await WebCryptoDeviceKeyAdapter.generateKeys(profile);

      const wrapped = await WebCryptoDeviceKeyAdapter.wrapPrivateKeys(
        profile,
        keys,
        masterKEK,
      );
      const restored = await WebCryptoDeviceKeyAdapter.unwrapPrivateKeys(
        profile,
        wrapped,
        masterKEK,
      );

      expect(restored.signing.privateKey.extractable).toBe(false);
    });

    it("unwrapped agreement private key is non-extractable", async () => {
      const masterKEK = await createMasterKEK();
      const keys = await WebCryptoDeviceKeyAdapter.generateKeys(profile);

      const wrapped = await WebCryptoDeviceKeyAdapter.wrapPrivateKeys(
        profile,
        keys,
        masterKEK,
      );
      const restored = await WebCryptoDeviceKeyAdapter.unwrapPrivateKeys(
        profile,
        wrapped,
        masterKEK,
      );

      expect(restored.agreement.privateKey.extractable).toBe(false);
    });

    it("wraps and unwraps ECDH P-256 private key (PKCS8 format)", async () => {
      const masterKEK = await createMasterKEK();
      const keys = await WebCryptoDeviceKeyAdapter.generateKeys(profile);

      const wrapped = await WebCryptoDeviceKeyAdapter.wrapPrivateKeys(
        profile,
        keys,
        masterKEK,
      );
      const restored = await WebCryptoDeviceKeyAdapter.unwrapPrivateKeys(
        profile,
        wrapped,
        masterKEK,
      );

      expect(restored.agreement.privateKey.algorithm.name).toBe("ECDH");
      expect(restored.agreement.publicKey.algorithm.name).toBe("ECDH");
    });

    it("signing IV and agreement IV are different in wrapped output", async () => {
      const masterKEK = await createMasterKEK();
      const keys = await WebCryptoDeviceKeyAdapter.generateKeys(profile);

      const wrapped = await WebCryptoDeviceKeyAdapter.wrapPrivateKeys(
        profile,
        keys,
        masterKEK,
      );

      const signingIv = new Uint8Array(wrapped.wrappedSigningPrivateKey).slice(
        0,
        12,
      );
      const agreementIv = new Uint8Array(
        wrapped.wrappedAgreementPrivateKey,
      ).slice(0, 12);

      expect(signingIv).not.toEqual(agreementIv);
    });
  });

  describe("deriveSlotKEK", () => {
    it("throws until the slot KDF contract is finalized", async () => {
      const keysA = await WebCryptoDeviceKeyAdapter.generateKeys(profile);
      const keysB = await WebCryptoDeviceKeyAdapter.generateKeys(profile);
      const exportedB = await WebCryptoDeviceKeyAdapter.exportPublicKeys(
        profile,
        keysB,
      );

      await expect(
        WebCryptoDeviceKeyAdapter.deriveSlotKEK(
          profile,
          keysA,
          exportedB.agreement,
        ),
      ).rejects.toThrow("deriveSlotKEK is not implemented");
    });
  });
});
