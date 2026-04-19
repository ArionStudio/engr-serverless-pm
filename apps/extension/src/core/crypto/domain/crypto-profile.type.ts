export type CryptoProfileId = "profile-v1";

export type CryptoProfile = Readonly<{
  readonly id: CryptoProfileId;

  readonly passwordPrehash: Readonly<{
    readonly digest: "SHA-256";
  }>;

  readonly masterKdf: Readonly<{
    readonly importAlgorithm: "PBKDF2" | "DUPA";
    readonly deriveAlgorithm: Readonly<{
      readonly name: "PBKDF2";
      readonly hash: "SHA-256";
      readonly iterations: number;
      readonly saltBytes: number;
    }>;
    readonly derivedKeyType: Readonly<{
      readonly name: "AES-GCM";
      readonly length: 256;
    }>;
  }>;

  readonly vaultEncryption: Readonly<{
    readonly algorithm: Readonly<{
      readonly name: "AES-GCM";
      readonly ivBytes: number;
      readonly tagLength: 128;
    }>;
  }>;

  readonly keyWrap: Readonly<{
    readonly algorithm: Readonly<{
      readonly name: "AES-GCM";
      readonly ivBytes: number;
      readonly tagLength: 128;
    }>;
    readonly wrappedKeyFormat: "raw";
  }>;

  readonly deviceSigning: Readonly<{
    readonly algorithm: Readonly<{
      readonly name: "Ed25519";
    }>;
    readonly signatureFormat: "raw-64";
  }>;

  readonly deviceAgreement: Readonly<{
    readonly algorithm: Readonly<{
      readonly name: "ECDH";
      readonly namedCurve: "P-256";
    }>;
  }>;

  readonly slotKdf: Readonly<{
    readonly algorithm: Readonly<{
      readonly name: "HKDF";
      readonly hash: "SHA-256";
    }>;
    readonly derivedKeyType: Readonly<{
      readonly name: "AES-GCM";
      readonly length: 256;
    }>;
  }>;

  readonly hashing: Readonly<{
    readonly digest: "SHA-256";
  }>;

  readonly canonicalization: Readonly<{
    readonly format: "JCS";
  }>;
}>;
