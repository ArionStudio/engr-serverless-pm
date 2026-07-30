import type { SerializedSignatureOf } from "../crypto/protected-artifact";
import type { DevicePublicSignKey, DeviceVaultPublicKey } from "./brand-keys";

export type DeviceTrustIdentity = {
  readonly deviceId: string;
  readonly publicSignKey: DevicePublicSignKey;
  readonly publicVaultKey: DeviceVaultPublicKey;
};

export type VaultTrustCertificatePayload = {
  readonly version: 1;
  readonly vaultId: string;
  readonly generation: number;
  readonly vaultKeyGeneration: number;
  readonly previousCertificateDigest: string | null;
  readonly authorizedByDeviceId: string;
  readonly trustedDevices: readonly DeviceTrustIdentity[];
};

export type VaultTrustCertificate = {
  readonly payload: VaultTrustCertificatePayload;
  readonly signature: SerializedSignatureOf<VaultTrustCertificatePayload>;
};

export type VaultTrustChain = {
  readonly certificates: readonly VaultTrustCertificate[];
};

export type LocalVaultTrustAnchor = {
  readonly version: 1;
  readonly vaultId: string;
  readonly genesisDeviceId: string;
  readonly genesisPublicSignKey: DevicePublicSignKey;
  readonly genesisCertificateDigest: string;
};

export type VerifiedVaultTrustState = {
  readonly generation: number;
  readonly vaultKeyGeneration: number;
  readonly certificateDigest: string;
  readonly trustedDevices: readonly DeviceTrustIdentity[];
};
