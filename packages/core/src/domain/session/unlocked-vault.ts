import type { DevicePrivateSignKey } from "../device-trust/brand-keys";
import type { VaultMasterKey } from "../snapshot/brand-keys";
import type { Vault } from "../vault/vault";
import type { VerifiedVaultTrustState } from "../device-trust/vault-trust";
import type { LocalVaultTrustAnchor } from "../device-trust/vault-trust";

export type TrustedSnapshotContext = {
  readonly snapshotDigest: string;
  readonly trust: VerifiedVaultTrustState;
};

export type UnlockedVault = {
  readonly vaultId: string;
  readonly deviceId: string;
  readonly vault: Vault;
  readonly vaultMasterKey: VaultMasterKey;
  readonly devicePrivateSignKey: DevicePrivateSignKey;
  readonly trustedSnapshotContext: TrustedSnapshotContext;
  readonly vaultTrustAnchor: LocalVaultTrustAnchor;
};
