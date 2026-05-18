import type { Device } from "../device/device";
import type { PasswordEntry } from "../password-entry";
import type { Tag } from "../tag";

export interface Vault {
  entries: PasswordEntry[];
  registeredDevices: Device[];
  tags: Tag[];
}
