import type {
  SerializedEncrypted,
  SerializedSignatureOf,
} from "../crypto/protected-artifact";
import type { TrustedDevice } from "../device-trust/trusted-device";
import type { Vault } from "../vault/vault";
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
  revision: number;
  algorithmSuiteId: string;
  createdByDeviceId: string;
};

export type UnsignedVaultSnapshot = {
  metadata: VaultSnapshotMetadata;
  trustedDevices: TrustedDevice[];
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
