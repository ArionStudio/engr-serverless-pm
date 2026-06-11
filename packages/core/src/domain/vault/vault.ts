import type { DeletedDeviceProfile, DeviceProfile } from "../device/device";
import type {
  DeletedPasswordEntry,
  PasswordEntry,
} from "../entry/password-entry.type";
import type { SyncConfig } from "../sync/sync-config.type";
import type { VersionVector } from "../sync/version-vector.type";
import type { DeletedTag, Tag } from "../entry/tag.type";

export interface Vault {
  versionVector: VersionVector;
  entries: PasswordEntry[];
  deletedEntries: DeletedPasswordEntry[];
  deviceProfiles: DeviceProfile[];
  deletedDeviceProfiles: DeletedDeviceProfile[];
  syncConfig?: SyncConfig;
  tags: Tag[];
  deletedTags: DeletedTag[];
}
