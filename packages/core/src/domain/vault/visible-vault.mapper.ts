import { toVisiblePasswordEntryFields } from "../entry/password-entry.mapper";
import type { Vault } from "./vault";
import type { VisibleVaultFields } from "./visible-vault.type";

export function toVisibleVaultFields(vault: Vault): VisibleVaultFields {
  return {
    entries: vault.entries.map(toVisiblePasswordEntryFields),
    deviceProfiles: vault.deviceProfiles.map(({ id, name, createdAt }) => ({
      id,
      name,
      createdAt,
    })),
    tags: vault.tags.map(({ id, name, groupId, color, shade, createdAt }) => ({
      id,
      name,
      groupId,
      color,
      shade,
      createdAt,
    })),
    tagGroups: vault.tagGroups.map((group) => ({ ...group })),
    folders: vault.folders.map(
      ({ id, name, icon, description, parentId, createdAt }) => ({
        id,
        name,
        icon,
        ...(description === undefined ? {} : { description }),
        parentId,
        createdAt,
      }),
    ),
    syncConfigured: vault.syncTarget !== undefined,
  };
}
