import { canonicalize } from "json-canonicalize";
import { describe, expect, it } from "vitest";
import {
  CURRENT_ALGORITHM_SUITE,
  type LocalKeysPayload,
  type ProtectionKeyFor,
  type SerializedWrapped,
} from "@lfspm/core";
import { encodeBase64Url } from "@lfspm/core/lib";
import { InvalidLocalKeysPayloadError } from "./index";
import { WebCryptoPort } from "./web-crypto.port";

const encoder = new TextEncoder();
const LOCAL_KEYS_PURPOSE = "lfspm-local-keys-payload-v1";

describe("WebCryptoPort local-keys hostile plaintext boundary", () => {
  it("rejects an authenticated local-keys payload with an extra field", async () => {
    const crypto = new WebCryptoPort();
    const signing = await crypto.generateDeviceSignKeyPair();
    const vault = await crypto.generateDeviceVaultKeyPair();
    const protectionKey =
      (await crypto.generateDeviceLocalProtectionKey()) as unknown as ProtectionKeyFor<LocalKeysPayload>;
    const encodedPayload = {
      devicePrivateSignKey: encodeBase64Url(new Uint8Array(signing.privateKey)),
      devicePrivateVaultKey: encodeBase64Url(new Uint8Array(vault.privateKey)),
      deviceLocalProtectionKey: encodeBase64Url(new Uint8Array(32).fill(3)),
      vaultTrustAnchor: {
        version: 1,
        vaultId: "vault-id",
        genesisDeviceId: "device-id",
        genesisPublicSignKey: encodeBase64Url(
          new Uint8Array(signing.publicKey),
        ),
        genesisCertificateDigest: digest(4),
      },
      futureField: true,
    };
    const wrapped = await encryptAuthenticatedLocalKeysPayload(
      encodedPayload,
      protectionKey,
    );

    await expectExactLocalKeysError(
      crypto.unwrapLocalKeysPayload(wrapped, protectionKey),
    );
  });

  it("rejects an authenticated, valid-length, non-importable private key", async () => {
    const crypto = new WebCryptoPort();
    const signing = await crypto.generateDeviceSignKeyPair();
    const vault = await crypto.generateDeviceVaultKeyPair();
    const protectionKey =
      (await crypto.generateDeviceLocalProtectionKey()) as unknown as ProtectionKeyFor<LocalKeysPayload>;
    const corruptedPrivateSignKey = new Uint8Array(signing.privateKey.slice(0));
    corruptedPrivateSignKey[0] = 0;
    const encodedPayload = {
      devicePrivateSignKey: encodeBase64Url(corruptedPrivateSignKey),
      devicePrivateVaultKey: encodeBase64Url(new Uint8Array(vault.privateKey)),
      deviceLocalProtectionKey: encodeBase64Url(new Uint8Array(32).fill(5)),
      vaultTrustAnchor: {
        version: 1,
        vaultId: "vault-id",
        genesisDeviceId: "device-id",
        genesisPublicSignKey: encodeBase64Url(
          new Uint8Array(signing.publicKey),
        ),
        genesisCertificateDigest: digest(6),
      },
    };
    const wrapped = await encryptAuthenticatedLocalKeysPayload(
      encodedPayload,
      protectionKey,
    );

    expect(corruptedPrivateSignKey.byteLength).toBe(
      signing.privateKey.byteLength,
    );
    await expectExactLocalKeysError(
      crypto.unwrapLocalKeysPayload(wrapped, protectionKey),
    );
  });

  it.each([
    ["signing", "devicePrivateSignKey", CURRENT_ALGORITHM_SUITE.signing],
    [
      "vault",
      "devicePrivateVaultKey",
      CURRENT_ALGORITHM_SUITE.vaultKeyWrapping,
    ],
  ] as const)(
    "rejects a wrong-length %s private key before returning local keys",
    async (_label, field, suite) => {
      const crypto = new WebCryptoPort();
      const signing = await crypto.generateDeviceSignKeyPair();
      const vault = await crypto.generateDeviceVaultKeyPair();
      const protectionKey =
        (await crypto.generateDeviceLocalProtectionKey()) as unknown as ProtectionKeyFor<LocalKeysPayload>;
      const encodedPayload = {
        devicePrivateSignKey: encodeBase64Url(
          new Uint8Array(signing.privateKey),
        ),
        devicePrivateVaultKey: encodeBase64Url(
          new Uint8Array(vault.privateKey),
        ),
        deviceLocalProtectionKey: encodeBase64Url(new Uint8Array(32).fill(5)),
        vaultTrustAnchor: {
          version: 1,
          vaultId: "vault-id",
          genesisDeviceId: "device-id",
          genesisPublicSignKey: encodeBase64Url(
            new Uint8Array(signing.publicKey),
          ),
          genesisCertificateDigest: digest(6),
        },
        [field]: encodeBase64Url(
          new Uint8Array(suite.privateKeyLengthBytes - 1),
        ),
      };
      const wrapped = await encryptAuthenticatedLocalKeysPayload(
        encodedPayload,
        protectionKey,
      );

      await expectExactLocalKeysError(
        crypto.unwrapLocalKeysPayload(wrapped, protectionKey),
      );
    },
  );
});

async function encryptAuthenticatedLocalKeysPayload(
  encodedPayload: unknown,
  protectionKey: ProtectionKeyFor<LocalKeysPayload>,
): Promise<SerializedWrapped<LocalKeysPayload>> {
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    protectionKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const nonce = new Uint8Array(12).fill(7);
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: nonce,
      additionalData: encoder.encode(
        canonicalize({ purpose: LOCAL_KEYS_PURPOSE }),
      ),
      tagLength: 128,
    },
    key,
    encoder.encode(canonicalize(encodedPayload)),
  );

  return {
    wrappedKey: encodeBase64Url(new Uint8Array(ciphertext)),
    wrappingNonce: encodeBase64Url(nonce),
  };
}

async function expectExactLocalKeysError(
  result: Promise<LocalKeysPayload>,
): Promise<void> {
  let caught: unknown;

  try {
    await result;
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(InvalidLocalKeysPayloadError);
  expect(caught).toMatchObject({
    name: "InvalidLocalKeysPayloadError",
    message: "Local keys payload is malformed.",
  });
  expect(caught).not.toHaveProperty("cause");
}

function digest(seed: number) {
  return encodeBase64Url(new Uint8Array(32).fill(seed));
}
