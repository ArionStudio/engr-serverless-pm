export interface AlgorithmSuite {
  readonly id: string;
  readonly signing: {
    readonly algorithm: "Ed25519";
  };
  readonly vaultMasterKeyGeneration: {
    readonly algorithm: "AES-GCM";
    readonly keyFormat: "raw";
    readonly keyLengthBits: 256;
  };
  readonly deviceSlotKeyGeneration: {
    readonly method: "secure-random";
    readonly byteLength: 32;
    readonly keyFormat: "raw";
  };
  readonly recoverySecretGeneration: {
    readonly method: "secure-random";
    readonly byteLength: 32;
    readonly keyFormat: "raw";
  };
  readonly recoverySecretEncoding: {
    readonly format: "BIP39";
    readonly wordCount: 24;
  };
  readonly localProtectionKeyDerivation: {
    readonly algorithm: "PBKDF2";
    readonly hash: "SHA-256";
    readonly iterations: 600_000;
    readonly outputKeyLengthBits: 256;
    readonly saltLengthBytes: 32;
  };
  readonly keyWrapping: {
    readonly algorithm: "A256GCMKW";
    readonly nonceLengthBytes: 12;
  };
  readonly vaultSnapshotEncryption: {
    readonly algorithm: "AES-256-GCM";
    readonly nonceLengthBytes: 12;
  };
  readonly unlockedVaultSessionPayloadKeyGeneration: {
    readonly method: "secure-random";
    readonly byteLength: 32;
    readonly keyFormat: "raw";
  };
  readonly unlockedVaultSessionPayloadEncryption: {
    readonly algorithm: "AES-256-GCM";
    readonly nonceLengthBytes: 12;
    readonly authenticatedData: [
      "sessionId",
      "vaultId",
      "sourceSnapshotVersionVector",
    ];
  };
  readonly vaultSnapshotSigning: {
    readonly algorithm: "Ed25519";
    readonly signatureFormat: "raw";
  };
}
