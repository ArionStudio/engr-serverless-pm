import { vi } from "vitest";
import { CURRENT_ALGORITHM_SUITE } from "../../domain/crypto/algorithm-suite.const";
import type { PasswordEntry } from "../../domain/entry/password-entry.type";
import type { VaultSnapshot } from "../../domain/snapshot/vault-snapshot";
import type { Tag } from "../../domain/entry/tag.type";
import type { UnlockedVault } from "../../domain/session/unlocked-vault";
import type { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import type { CoreTestPorts } from "./ports";
import type { CoreTestValues } from "./values";

export const singlePasswordEntry: PasswordEntry = {
  id: "single-entry",
  password: "secret-password",
  login: "user@example.com",
  tags: [1],
  sanitizedUrl: "https://example.com/login",
  versionVector: {
    "device-id": 1,
  },
};

export const firstPasswordEntry: PasswordEntry = {
  id: "entry-1",
  password: "first-password",
  login: "first@example.com",
  tags: [1],
  sanitizedUrl: "https://example.com/login",
  versionVector: {
    "device-id": 1,
  },
};

export const secondPasswordEntry: PasswordEntry = {
  id: "entry-2",
  password: "second-password",
  login: "second@example.com",
  tags: [2],
  sanitizedUrl: "https://service.example.com/account",
  versionVector: {
    "device-id": 1,
  },
};

export const workTag: Tag = {
  id: 1,
  name: "Work",
  versionVector: {
    "device-id": 1,
  },
};

export const personalTag: Tag = {
  id: 2,
  name: "Personal",
  versionVector: {
    "device-id": 1,
  },
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
) {
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

export function createVaultSnapshotServiceMock(
  values: CoreTestValues,
): VaultSnapshotService {
  const currentVaultSnapshot: VaultSnapshot = {
    metadata: {
      id: values.vaultId,
      schemaVersion: 1,
      vaultCreationTimestamp: values.timestamp - 1_000,
      revisionTimestamp: values.timestamp,
      revision: 1,
      algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
      createdByDeviceId: values.deviceId,
    },
    trustedDevices: [
      {
        id: values.deviceId,
        publicKeys: {
          signingKey: values.devicePublicSignKey,
        },
      },
    ],
    keySlots: {
      deviceSlots: [
        {
          deviceId: values.deviceId,
          protectedVaultMasterKey: values.protectedDeviceVaultMasterKey,
        },
      ],
      recoveryKeySlot: {
        protectedVaultMasterKey: values.protectedRecoveryVaultMasterKey,
      },
    },
    content: values.encryptedVault,
    signature: values.snapshotSignature,
  };

  return {
    requireCurrentSnapshotForUnlockedVault: vi.fn(
      async () => currentVaultSnapshot,
    ),
    persistUnlockedVault: vi.fn(async () => ({
      revision: 2,
      revisionTimestamp: values.timestamp + 1,
      deviceId: values.deviceId,
    })),
  } as unknown as VaultSnapshotService;
}
