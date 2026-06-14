import type {
  SerializedEncrypted,
  SerializedSignatureOf,
} from "../crypto/protected-artifact";
import type { Vault } from "../vault/vault";
import type { VersionVector } from "../versioning/version-vector.type";
import type {
  DeviceKeySlot,
  EnrollmentKeySlot,
  RecoveryKeySlot,
} from "./key-slot";

export type VaultSnapshotSchemaVersion = 1;

export type VaultSnapshotMetadata = {
  id: string; // random identifier
  schemaVersion: VaultSnapshotSchemaVersion;
  vaultCreationTimestamp: number;
  revisionTimestamp: number;
  snapshotVersionVector: VersionVector;
  algorithmSuiteId: string;
  createdByDeviceId: string;
};

export type UnsignedVaultSnapshot = {
  metadata: VaultSnapshotMetadata;
  keySlots: {
    deviceSlots: DeviceKeySlot[];
    recoveryKeySlot: RecoveryKeySlot;
    enrollmentKeySlot?: EnrollmentKeySlot;
  };
  content: SerializedEncrypted<Vault>;
};

export type VaultSnapshot = UnsignedVaultSnapshot & {
  signature: SerializedSignatureOf<UnsignedVaultSnapshot>;
};
