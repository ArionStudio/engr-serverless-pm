import type {
  SerializedEncrypted,
  SerializedSignatureOf,
} from "../crypto/protected-artifact";
import type { CompletedDeviceEnrollmentProof } from "../device-trust";
import type { Vault } from "../vault/vault";
import type { VersionVector } from "../versioning/version-vector.type";
import type { DeviceKeySlot, EnrollmentKeySlot } from "./key-slot";

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
    enrollmentKeySlot?: EnrollmentKeySlot;
    completedEnrollments?: CompletedDeviceEnrollmentProof[];
  };
  content: SerializedEncrypted<Vault>;
};

export type VaultSnapshot = UnsignedVaultSnapshot & {
  signature: SerializedSignatureOf<UnsignedVaultSnapshot>;
};
