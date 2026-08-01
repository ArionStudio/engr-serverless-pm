import { toVisiblePasswordEntryFields } from "../entry/password-entry.mapper";
import type { Vault, VisibleVaultFields } from "./vault";

export function toVisibleVaultFields(vault: Vault): VisibleVaultFields {
  return {
    entries: vault.entries.map(toVisiblePasswordEntryFields),
    deviceProfiles: vault.deviceProfiles.map(({ id, name, createdAt }) => ({
      id,
      name,
      createdAt,
    })),
    tags: vault.tags.map(({ id, name }) => ({ id, name })),
    syncConfigured: vault.syncTarget !== undefined,
  };
}
