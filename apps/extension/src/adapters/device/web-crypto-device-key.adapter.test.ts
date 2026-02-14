import { describe, it, expect } from "vitest";
import { WebCryptoDeviceKeyAdapter } from "./web-crypto-device-key.adapter";
import { WebCryptoApiAdapter } from "@/adapters/crypto/web-crypto-api.adapter";
import { CRYPTO_PROFILE_V1 } from "@/core/crypto/profiles/crypto-profile.const";

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

    it("sets the correct suiteId", async () => {
      const keys = await WebCryptoDeviceKeyAdapter.generateKeys(profile);
      expect(keys.suiteId).toBe("suite-v1");
    });

    it("generates extractable signing private key (required for wrapKey)", async () => {
      const keys = await WebCryptoDeviceKeyAdapter.generateKeys(profile);
      expect(keys.signing.privateKey.extractable).toBe(true);
    });
  });

  describe("exportPublicKeysJwk", () => {
    it("exports signing public key as OKP/Ed25519 JWK", async () => {
      const keys = await WebCryptoDeviceKeyAdapter.generateKeys(profile);
      const jwks = await WebCryptoDeviceKeyAdapter.exportPublicKeysJwk(
        profile,
        keys,
      );

      expect(jwks.signingPublicJwk.kty).toBe("OKP");
      expect(jwks.signingPublicJwk.crv).toBe("Ed25519");
    });

    it("exports agreement public key as EC/P-256 JWK", async () => {
      const keys = await WebCryptoDeviceKeyAdapter.generateKeys(profile);
      const jwks = await WebCryptoDeviceKeyAdapter.exportPublicKeysJwk(
        profile,
        keys,
      );

      expect(jwks.agreementPublicJwk.kty).toBe("EC");
      expect(jwks.agreementPublicJwk.crv).toBe("P-256");
    });
  });

  describe("sign / verify", () => {
    it("round-trips: sign then verify succeeds", async () => {
      const keys = await WebCryptoDeviceKeyAdapter.generateKeys(profile);
      const jwks = await WebCryptoDeviceKeyAdapter.exportPublicKeysJwk(
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
        jwks.signingPublicJwk,
      );

      expect(valid).toBe(true);
    });

    it("fails verification with different data", async () => {
      const keys = await WebCryptoDeviceKeyAdapter.generateKeys(profile);
      const jwks = await WebCryptoDeviceKeyAdapter.exportPublicKeysJwk(
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
        jwks.signingPublicJwk,
      );

      expect(valid).toBe(false);
    });

    it("fails verification with a different key", async () => {
      const keys1 = await WebCryptoDeviceKeyAdapter.generateKeys(profile);
      const keys2 = await WebCryptoDeviceKeyAdapter.generateKeys(profile);
      const jwks2 = await WebCryptoDeviceKeyAdapter.exportPublicKeysJwk(
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
        jwks2.signingPublicJwk,
      );

      expect(valid).toBe(false);
    });
  });

  describe("wrapPrivateKeys / unwrapPrivateKeys", () => {
    it("round-trips: wrap → unwrap → sign → verify with original public JWK", async () => {
      const masterKEK = await createMasterKEK();
      const keys = await WebCryptoDeviceKeyAdapter.generateKeys(profile);
      const jwks = await WebCryptoDeviceKeyAdapter.exportPublicKeysJwk(
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

      // Sign with restored keys, verify with original public JWK
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
        jwks.signingPublicJwk,
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

      // Verify ECDH agreement still works with restored keys
      const otherKeys = await WebCryptoDeviceKeyAdapter.generateKeys(profile);
      const otherJwks = await WebCryptoDeviceKeyAdapter.exportPublicKeysJwk(
        profile,
        otherKeys,
      );

      const secretOriginal = await WebCryptoDeviceKeyAdapter.deriveSharedSecret(
        profile,
        keys,
        otherJwks.agreementPublicJwk,
      );
      const secretRestored = await WebCryptoDeviceKeyAdapter.deriveSharedSecret(
        profile,
        restored,
        otherJwks.agreementPublicJwk,
      );

      expect(secretRestored).toEqual(secretOriginal);
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

  describe("deriveSharedSecret", () => {
    it("produces mutual agreement (A.priv + B.pub === B.priv + A.pub)", async () => {
      const keysA = await WebCryptoDeviceKeyAdapter.generateKeys(profile);
      const keysB = await WebCryptoDeviceKeyAdapter.generateKeys(profile);
      const jwksA = await WebCryptoDeviceKeyAdapter.exportPublicKeysJwk(
        profile,
        keysA,
      );
      const jwksB = await WebCryptoDeviceKeyAdapter.exportPublicKeysJwk(
        profile,
        keysB,
      );

      const secretAB = await WebCryptoDeviceKeyAdapter.deriveSharedSecret(
        profile,
        keysA,
        jwksB.agreementPublicJwk,
      );
      const secretBA = await WebCryptoDeviceKeyAdapter.deriveSharedSecret(
        profile,
        keysB,
        jwksA.agreementPublicJwk,
      );

      expect(secretAB).toEqual(secretBA);
    });

    it("produces 32 bytes", async () => {
      const keysA = await WebCryptoDeviceKeyAdapter.generateKeys(profile);
      const keysB = await WebCryptoDeviceKeyAdapter.generateKeys(profile);
      const jwksB = await WebCryptoDeviceKeyAdapter.exportPublicKeysJwk(
        profile,
        keysB,
      );

      const secret = await WebCryptoDeviceKeyAdapter.deriveSharedSecret(
        profile,
        keysA,
        jwksB.agreementPublicJwk,
      );

      expect(secret.length).toBe(32);
    });

    it("produces different secrets for different pairs", async () => {
      const keysA = await WebCryptoDeviceKeyAdapter.generateKeys(profile);
      const keysB = await WebCryptoDeviceKeyAdapter.generateKeys(profile);
      const keysC = await WebCryptoDeviceKeyAdapter.generateKeys(profile);
      const jwksB = await WebCryptoDeviceKeyAdapter.exportPublicKeysJwk(
        profile,
        keysB,
      );
      const jwksC = await WebCryptoDeviceKeyAdapter.exportPublicKeysJwk(
        profile,
        keysC,
      );

      const secretAB = await WebCryptoDeviceKeyAdapter.deriveSharedSecret(
        profile,
        keysA,
        jwksB.agreementPublicJwk,
      );
      const secretAC = await WebCryptoDeviceKeyAdapter.deriveSharedSecret(
        profile,
        keysA,
        jwksC.agreementPublicJwk,
      );

      expect(secretAB).not.toEqual(secretAC);
    });
  });
});
