import type {
  DeletedDeviceProfile,
  DeviceProfile,
} from "../device-profile/device-profile";
import type {
  DeletedPasswordEntry,
  PasswordEntry,
} from "../entry/password-entry.type";
import type { SyncTarget } from "../sync/sync-config.type";
import type { VaultSnapshotDescriptor } from "../snapshot/vault-snapshot-descriptor.type";
import type { VaultSnapshot } from "../snapshot/vault-snapshot";
import type { VersionVector } from "../versioning/version-vector.type";
import type { DeletedTag, Tag } from "../entry/tag.type";

export interface Vault {
  versionVector: VersionVector;
  entries: PasswordEntry[];
  deletedEntries: DeletedPasswordEntry[];
  deviceProfiles: DeviceProfile[];
  deletedDeviceProfiles: DeletedDeviceProfile[];
  syncTarget?: SyncTarget;
  syncRemovalPending?: {
    readonly expectedRemoteSnapshotDescriptor: VaultSnapshotDescriptor | null;
    readonly rollbackSnapshot: VaultSnapshot;
  };
  providerCredentialRevocationPending?: {
    readonly revokedDeviceIds: readonly string[];
    readonly vaultKeyGeneration: number;
  };
  tags: Tag[];
  deletedTags: DeletedTag[];
}
