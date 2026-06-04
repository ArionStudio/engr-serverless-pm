import { vi } from "vitest";
import type { PasswordEntry } from "../../domain/entry/password-entry.type";
import type { Tag } from "../../domain/entry/tag.type";
import type { UnlockedVault } from "../../domain/vault/unlocked-vault";
import type { UnlockedVaultSession } from "../../domain/vault/unlocked-vault-session";
import type { PersistUnlockedVaultUseCase } from "../../use-cases/vault-snapshots/persist-unlocked-vault";
import type { CoreTestPorts } from "./ports";
import type { CoreTestValues } from "./values";

export const singlePasswordEntry: PasswordEntry = {
  id: "single-entry",
  password: "secret-password",
  login: "user@example.com",
  tags: [1],
  sanitizedUrl: "https://example.com/login",
};

export const firstPasswordEntry: PasswordEntry = {
  id: "entry-1",
  password: "first-password",
  login: "first@example.com",
  tags: [1],
  sanitizedUrl: "https://example.com/login",
};

export const secondPasswordEntry: PasswordEntry = {
  id: "entry-2",
  password: "second-password",
  login: "second@example.com",
  tags: [2],
  sanitizedUrl: "https://service.example.com/account",
};

export const workTag: Tag = {
  id: 1,
  name: "Work",
};

export const personalTag: Tag = {
  id: 2,
  name: "Personal",
};

export const standardPasswordEntries = [
  firstPasswordEntry,
  secondPasswordEntry,
];

export const standardVaultTags = [workTag, personalTag];

export function createUnlockedVaultWithEntries(
  values: CoreTestValues,
  entries: PasswordEntry[],
  tags: Tag[] = [],
): UnlockedVault {
  return {
    vaultId: values.vaultId,
    deviceId: values.deviceId,
    vault: {
      ...values.decryptedVault,
      entries,
      tags,
    },
    vaultMasterKey: values.vaultMasterKey,
    devicePrivateSignKey: values.devicePrivateSignKey,
  };
}

export function createUnlockedVaultSessionWithEntries(
  values: CoreTestValues,
  entries: PasswordEntry[],
  tags: Tag[] = [],
  sourceSnapshotRevision = 1,
): UnlockedVaultSession {
  return {
    unlockedVault: createUnlockedVaultWithEntries(values, entries, tags),
    sourceSnapshotRevision,
  };
}

export function saveUnlockedVaultWithEntries(
  ports: CoreTestPorts,
  values: CoreTestValues,
  entries: PasswordEntry[],
  tags: Tag[] = [],
): void {
  ports.saved.unlockedVaultSession = createUnlockedVaultSessionWithEntries(
    values,
    entries,
    tags,
  );
}

export function createPersistUnlockedVaultUseCaseMock(
  values: CoreTestValues,
): PersistUnlockedVaultUseCase {
  return {
    execute: vi.fn(async () => ({
      revision: 2,
      revisionTimestamp: values.timestamp + 1,
      deviceId: values.deviceId,
    })),
  } as unknown as PersistUnlockedVaultUseCase;
}
