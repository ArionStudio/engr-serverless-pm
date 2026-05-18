import type { Device } from "../device/device";
import type { PasswordEntry } from "../entry/password-entry.type";
import type { Tag } from "../entry/tag.type";

export interface Vault {
  entries: PasswordEntry[];
  registeredDevices: Device[];
  tags: Tag[];
}
