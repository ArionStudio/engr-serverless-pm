import type { AlgorithmSuite } from "./algorithm-suite.type";

export const CURRENT_ALGORITHM_SUITE: AlgorithmSuite = {
  id: "spm-v1",
  signing: {
    algorithm: "Ed25519",
  },
  vaultMasterKeyGeneration: {
    algorithm: "AES-GCM",
    keyFormat: "raw",
    keyLengthBits: 256,
  },
  vaultKeyWrapping: {
    keyAgreement: "ECDH",
    namedCurve: "P-256",
    keyDerivation: "HKDF",
    hash: "SHA-256",
    encryption: "AES-256-GCM",
    keyLengthBits: 256,
    saltLengthBytes: 32,
    nonceLengthBytes: 12,
    authenticatedData: [
      "vaultId",
      "deviceId",
      "vaultKeyGeneration",
      "algorithmSuiteId",
    ],
  },
  deviceLocalProtectionKeyGeneration: {
    method: "secure-random",
    byteLength: 32,
    keyFormat: "raw",
  },
  deviceSyncCredentialEncryption: {
    algorithm: "AES-256-GCM",
    nonceLengthBytes: 12,
    authenticatedData: ["vaultId", "deviceId", "provider", "target"],
  },
  recoverySecretGeneration: {
    method: "secure-random",
    byteLength: 32,
    keyFormat: "raw",
  },
  recoverySecretEncoding: {
    format: "BIP39",
    wordCount: 24,
  },
  localProtectionKeyDerivation: {
    algorithm: "PBKDF2",
    hash: "SHA-256",
    iterations: 600_000,
    outputKeyLengthBits: 256,
    saltLengthBytes: 32,
  },
  keyWrapping: {
    algorithm: "A256GCMKW",
    nonceLengthBytes: 12,
  },
  vaultSnapshotEncryption: {
    algorithm: "AES-256-GCM",
    nonceLengthBytes: 12,
  },
  unlockedVaultSessionPayloadKeyGeneration: {
    method: "secure-random",
    byteLength: 32,
    keyFormat: "raw",
  },
  unlockedVaultSessionPayloadEncryption: {
    algorithm: "AES-256-GCM",
    nonceLengthBytes: 12,
    authenticatedData: ["sessionId", "vaultId", "sourceSnapshotVersionVector"],
  },
  vaultSnapshotSigning: {
    algorithm: "Ed25519",
    signatureFormat: "raw",
  },
};
