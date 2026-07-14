import type { SerializedEncrypted } from "../crypto/protected-artifact";
import type { Vault } from "../vault/vault";
import type { VersionVector } from "../versioning/version-vector.type";
import type { UnlockedVault } from "./unlocked-vault";
import type { UnlockedVaultSessionPayloadKey } from "./unlocked-vault-session-payload-key";

export type UnlockedVaultSession = {
  readonly unlockedVault: UnlockedVault;
  readonly sourceSnapshotVersionVector: VersionVector;
};

export type UnlockedVaultSessionMaterial = {
  readonly sessionId: string;
  readonly vaultId: string;
  readonly sourceSnapshotVersionVector: VersionVector;
  readonly deviceId: string;
  readonly vaultMasterKey: UnlockedVault["vaultMasterKey"];
  readonly devicePrivateSignKey: UnlockedVault["devicePrivateSignKey"];
  readonly payloadKey: UnlockedVaultSessionPayloadKey;
  readonly trustedSnapshotContext: UnlockedVault["trustedSnapshotContext"];
  readonly vaultTrustAnchor: UnlockedVault["vaultTrustAnchor"];
};

export type EncryptedUnlockedVaultSessionPayload = {
  readonly sessionId: string;
  readonly vaultId: string;
  readonly sourceSnapshotVersionVector: VersionVector;
  readonly content: SerializedEncrypted<{
    readonly vault: Vault;
  }>;
};
