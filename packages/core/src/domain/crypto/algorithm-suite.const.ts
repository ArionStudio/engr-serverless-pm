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
  deviceSlotKeyGeneration: {
    method: "secure-random",
    byteLength: 32,
    keyFormat: "raw",
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
