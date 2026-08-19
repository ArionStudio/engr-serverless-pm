export interface AlgorithmSuite {
  readonly id: string;
  readonly signing: {
    readonly algorithm: "Ed25519";
    readonly canonicalization: "JCS-RFC8785";
    readonly publicKeyFormat: "raw";
    readonly publicKeyLengthBytes: 32;
    readonly privateKeyFormat: "pkcs8";
    readonly privateKeyLengthBytes: 48;
  };
  readonly vaultMasterKeyGeneration: {
    readonly algorithm: "AES-GCM";
    readonly keyFormat: "raw";
    readonly keyLengthBits: 256;
  };
  readonly vaultKeyWrapping: {
    readonly keyAgreement: "ECDH";
    readonly namedCurve: "P-256";
    readonly keyDerivation: "HKDF";
    readonly hash: "SHA-256";
    readonly publicKeyFormat: "raw";
    readonly publicKeyLengthBytes: 65;
    readonly privateKeyFormat: "pkcs8";
    readonly privateKeyLengthBytes: 138;
    readonly publicKeyEncoding: "uncompressed";
    readonly hkdfInfoPurpose: "lfspm-vault-key-envelope-v1";
    readonly hkdfInfoContext: [
      "vaultId",
      "deviceId",
      "vaultKeyGeneration",
      "algorithmSuiteId",
    ];
    readonly encryption: "AES-256-GCM";
    readonly keyLengthBits: 256;
    readonly saltLengthBytes: 32;
    readonly nonceLengthBytes: 12;
    readonly authenticatedData: [
      "vaultId",
      "deviceId",
      "vaultKeyGeneration",
      "algorithmSuiteId",
    ];
  };
  readonly deviceLocalProtectionKeyGeneration: {
    readonly method: "secure-random";
    readonly byteLength: 32;
    readonly keyFormat: "raw";
  };
  readonly deviceSyncCredentialEncryption: {
    readonly algorithm: "AES-256-GCM";
    readonly nonceLengthBytes: 12;
    readonly authenticatedData: ["vaultId", "deviceId", "provider", "target"];
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
    readonly algorithm: "AES-256-GCM";
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
    readonly canonicalization: "JCS-RFC8785";
  };
}
