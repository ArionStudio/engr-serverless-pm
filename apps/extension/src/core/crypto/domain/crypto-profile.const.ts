import type { CryptoProfile } from "./crypto-profile.type";

export const CRYPTO_PROFILE_V1: CryptoProfile = {
  id: "profile-v1",

  passwordPrehash: {
    digest: "SHA-256",
  },

  masterKdf: {
    importAlgorithm: "PBKDF2",
    deriveAlgorithm: {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: 600_000,
      saltBytes: 32,
    },
    derivedKeyType: {
      name: "AES-GCM",
      length: 256,
    },
  },

  vaultEncryption: {
    algorithm: {
      name: "AES-GCM",
      ivBytes: 12,
      tagLength: 128,
    },
  },

  keyWrap: {
    algorithm: {
      name: "AES-GCM",
      ivBytes: 12,
      tagLength: 128,
    },
    wrappedKeyFormat: "raw",
  },

  deviceSigning: {
    algorithm: {
      name: "Ed25519",
    },
    signatureFormat: "raw-64",
  },

  deviceAgreement: {
    algorithm: {
      name: "ECDH",
      namedCurve: "P-256",
    },
  },

  slotKdf: {
    algorithm: {
      name: "HKDF",
      hash: "SHA-256",
    },
    derivedKeyType: {
      name: "AES-GCM",
      length: 256,
    },
  },

  hashing: {
    digest: "SHA-256",
  },

  canonicalization: {
    format: "JCS",
  },
} as const;

export const DEFAULT_CRYPTO_PROFILE = CRYPTO_PROFILE_V1;
