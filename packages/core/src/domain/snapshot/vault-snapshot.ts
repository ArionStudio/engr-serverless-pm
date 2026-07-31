import type {
  SerializedEncrypted,
  SerializedSignatureOf,
} from "../crypto/protected-artifact";
import type { Vault } from "../vault/vault";
import type { VersionVector } from "../versioning/version-vector.type";
import type { DeviceKeySlot } from "./key-slot";
import type { VaultTrustChain } from "../device-trust/vault-trust";

export type VaultSnapshotSchemaVersion = 1;

export type VaultSnapshotMetadata = {
  id: string; // random identifier
  schemaVersion: VaultSnapshotSchemaVersion;
  vaultCreationTimestamp: number;
  revisionTimestamp: number;
  snapshotVersionVector: VersionVector;
  algorithmSuiteId: string;
  createdByDeviceId: string;
  vaultKeyGeneration: number;
};

export type UnsignedVaultSnapshot = {
  metadata: VaultSnapshotMetadata;
  trustChain: VaultTrustChain;
  keySlots: {
    deviceSlots: DeviceKeySlot[];
  };
  content: SerializedEncrypted<Vault>;
};

export type VaultSnapshot = UnsignedVaultSnapshot & {
  signature: SerializedSignatureOf<UnsignedVaultSnapshot>;
};
