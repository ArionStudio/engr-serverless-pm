import type {
  PasswordEntry,
  PasswordEntryInput,
} from "../entry/password-entry.type";
import { incrementVersionVector } from "../sync/version-vector.utils";
import type { Vault } from "./vault";

export function addPasswordEntryToVault(
  vault: Vault,
  entryId: string,
  entryInput: PasswordEntryInput,
  deviceId: string,
): Vault {
  const versionVector = incrementVersionVector(vault.versionVector, deviceId);
  const deletedEntry = vault.deletedEntries.find(
    (vaultDeletedEntry) => vaultDeletedEntry.id === entryId,
  );
  const entry: PasswordEntry = {
    id: entryId,
    ...entryInput,
    versionVector:
      deletedEntry === undefined
        ? {
            [deviceId]: versionVector[deviceId],
          }
        : incrementVersionVector(deletedEntry.versionVector, deviceId),
  };

  return {
    ...vault,
    versionVector,
    entries: [...vault.entries, entry],
    deletedEntries: vault.deletedEntries.filter(
      (deletedEntry) => deletedEntry.id !== entryId,
    ),
  };
}

export function updatePasswordEntryInVault(
  vault: Vault,
  entryId: string,
  entryInput: PasswordEntryInput,
  deviceId: string,
): Vault {
  const entryIndex = vault.entries.findIndex((entry) => entry.id === entryId);

  if (entryIndex === -1) {
    return vault;
  }

  const versionVector = incrementVersionVector(vault.versionVector, deviceId);
  const entries = [...vault.entries];
  const currentEntry = entries[entryIndex];

  entries[entryIndex] = {
    id: entryId,
    ...entryInput,
    versionVector: incrementVersionVector(currentEntry.versionVector, deviceId),
  };

  return {
    ...vault,
    versionVector,
    entries,
  };
}

export function removePasswordEntryFromVault(
  vault: Vault,
  entryId: string,
  deviceId: string,
  deletedAt: number,
): Vault {
  const entry = vault.entries.find((vaultEntry) => vaultEntry.id === entryId);

  if (entry === undefined) {
    return vault;
  }

  const versionVector = incrementVersionVector(vault.versionVector, deviceId);
  const deletedEntryVersionVector = incrementVersionVector(
    entry.versionVector,
    deviceId,
  );

  return {
    ...vault,
    versionVector,
    entries: vault.entries.filter((vaultEntry) => vaultEntry.id !== entryId),
    deletedEntries: [
      ...vault.deletedEntries.filter(
        (deletedEntry) => deletedEntry.id !== entryId,
      ),
      {
        id: entryId,
        versionVector: deletedEntryVersionVector,
        deletedAt,
      },
    ],
  };
}
