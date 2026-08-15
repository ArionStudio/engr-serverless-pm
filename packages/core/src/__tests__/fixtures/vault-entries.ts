import { vi } from "vitest";
import { CURRENT_ALGORITHM_SUITE } from "../../domain/crypto/algorithm-suite.const";
import type { PasswordEntry } from "../../domain/entry/password-entry.type";
import type { VaultSnapshot } from "../../domain/snapshot/vault-snapshot";
import type { Tag } from "../../domain/entry/tag.type";
import type { UnlockedVault } from "../../domain/session/unlocked-vault";
import type { EncryptedDeviceSyncCredentialState } from "../../domain/sync";
import type { VersionVector } from "../../domain/versioning/version-vector.type";
import {
  compareVersionVectors,
  incrementVersionVector,
} from "../../domain/versioning/version-vector.utils";
import type {
  PreparedLocalVaultSnapshotRestore,
  VaultSnapshotService,
} from "../../services/snapshot/vault-snapshot.service";
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
    devicePrivateVaultKey: values.devicePrivateVaultKey,
    deviceLocalProtectionKey: values.deviceLocalProtectionKey,
    trustedSnapshotContext: {
      snapshotDigest: values.vaultSnapshotDigest,
      trust: values.verifiedVaultTrustState,
    },
    vaultTrustAnchor: values.vaultTrustAnchor,
  };
}

export function createUnlockedVaultSessionWithEntries(
  values: CoreTestValues,
  entries: PasswordEntry[],
  tags: Tag[] = [],
  sourceSnapshotVersionVector: VersionVector = { [values.deviceId]: 1 },
) {
  return {
    sessionId: values.sessionId,
    unlockedVault: createUnlockedVaultWithEntries(values, entries, tags),
    sourceSnapshotVersionVector,
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
  ports: CoreTestPorts,
): VaultSnapshotService {
  const initialVaultSnapshot: VaultSnapshot = {
    metadata: {
      id: values.vaultId,
      schemaVersion: 1,
      vaultCreationTimestamp: values.timestamp - 1_000,
      revisionTimestamp: values.timestamp,
      snapshotVersionVector: {
        [values.deviceId]: 1,
      },
      algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
      createdByDeviceId: values.deviceId,
      vaultKeyGeneration: values.vaultKeyGeneration,
    },
    trustChain: values.vaultTrustChain,
    keySlots: {
      deviceSlots: [
        {
          deviceId: values.deviceId,
          vaultKeyGeneration: values.vaultKeyGeneration,
          envelope: values.vaultKeyEnvelope,
        },
      ],
    },
    content: values.encryptedVault,
    signature: values.snapshotSignature,
  };
  ports.saved.vaultSnapshot = initialVaultSnapshot;
  ports.saved.localVaultTrustCheckpoint = values.localVaultTrustCheckpoint;
  const snapshotRestoreStates = new WeakMap<
    VaultSnapshot,
    {
      readonly snapshotDigest: string;
      readonly checkpoint: PreparedLocalVaultSnapshotRestore["checkpoint"];
    }
  >();
  snapshotRestoreStates.set(initialVaultSnapshot, {
    snapshotDigest: values.vaultSnapshotDigest,
    checkpoint: values.localVaultTrustCheckpoint,
  });

  const requireSavedVaultSnapshot = (): VaultSnapshot => {
    const snapshot = ports.saved.vaultSnapshot;

    if (snapshot === undefined) {
      throw new Error("Expected the vault snapshot fixture to be initialized.");
    }

    return snapshot;
  };

  const prepareLocalVaultSnapshotRestore = vi.fn(
    async (
      vaultSnapshot: VaultSnapshot,
      _unlockedVault: UnlockedVault,
      syncCredentialState?: EncryptedDeviceSyncCredentialState | null,
    ): Promise<PreparedLocalVaultSnapshotRestore> => {
      const checkpoint = ports.saved.localVaultTrustCheckpoint;

      if (
        ports.saved.vaultSnapshot !== vaultSnapshot ||
        checkpoint === undefined ||
        checkpoint.payload.vaultId !== vaultSnapshot.metadata.id ||
        checkpoint.payload.snapshotDigest !== ports.saved.vaultSnapshotDigest ||
        compareVersionVectors(
          checkpoint.payload.snapshotVersionVector,
          vaultSnapshot.metadata.snapshotVersionVector,
        ) !== "equal"
      ) {
        throw new Error(
          "Expected the prepared restore fixture state to match the current snapshot.",
        );
      }

      return {
        snapshot: vaultSnapshot,
        checkpoint,
        ...(syncCredentialState === undefined ? {} : { syncCredentialState }),
      };
    },
  );

  const restorePreparedLocalVaultSnapshot = vi.fn(
    async (
      preparedRestore: PreparedLocalVaultSnapshotRestore,
      expectedSnapshotDigest: string,
    ) => {
      await ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint({
        expectedSnapshotDigest,
        snapshot: preparedRestore.snapshot,
        checkpoint: preparedRestore.checkpoint,
        ...(preparedRestore.syncCredentialState === undefined
          ? {}
          : { syncCredentialState: preparedRestore.syncCredentialState }),
      });
      snapshotRestoreStates.set(preparedRestore.snapshot, {
        snapshotDigest: preparedRestore.checkpoint.payload.snapshotDigest,
        checkpoint: preparedRestore.checkpoint,
      });
    },
  );

  const restoreLocalVaultSnapshot = vi.fn(
    async (
      vaultSnapshot: VaultSnapshot,
      replacedSnapshot: VaultSnapshot,
      _unlockedVault: UnlockedVault,
      syncCredentialState?: EncryptedDeviceSyncCredentialState | null,
    ) => {
      const restoreState = snapshotRestoreStates.get(vaultSnapshot);
      const replacedState = snapshotRestoreStates.get(replacedSnapshot);

      if (
        restoreState === undefined ||
        replacedState === undefined ||
        ports.saved.vaultSnapshot !== replacedSnapshot ||
        ports.saved.vaultSnapshotDigest !== replacedState.snapshotDigest
      ) {
        throw new Error(
          "Expected the direct restore fixture state to match both snapshots.",
        );
      }

      await restorePreparedLocalVaultSnapshot(
        {
          snapshot: vaultSnapshot,
          checkpoint: restoreState.checkpoint,
          ...(syncCredentialState === undefined ? {} : { syncCredentialState }),
        },
        replacedState.snapshotDigest,
      );
    },
  );

  return {
    requireCurrentSnapshotForUnlockedVault: vi.fn(async () =>
      requireSavedVaultSnapshot(),
    ),
    requireLocalVaultSnapshot: vi.fn(async () => requireSavedVaultSnapshot()),
    restoreLocalVaultSnapshot,
    prepareLocalVaultSnapshotRestore,
    restorePreparedLocalVaultSnapshot,
    persistUnlockedVault: vi.fn(
      async (
        _vaultId: string,
        unlockedVault: UnlockedVault,
        _sourceSnapshotVersionVector: VersionVector,
        options: {
          readonly baseSnapshotVersionVector?: VersionVector;
          readonly keySlots?: VaultSnapshot["keySlots"];
          readonly vaultKeyGeneration?: number;
        } = {},
      ) => {
        const currentVaultSnapshot = requireSavedVaultSnapshot();
        const persistedVaultSnapshot = {
          ...currentVaultSnapshot,
          metadata: {
            ...currentVaultSnapshot.metadata,
            revisionTimestamp: values.timestamp + 1,
            snapshotVersionVector: incrementVersionVector(
              options.baseSnapshotVersionVector ??
                currentVaultSnapshot.metadata.snapshotVersionVector,
              unlockedVault.deviceId,
            ),
            createdByDeviceId: unlockedVault.deviceId,
            vaultKeyGeneration:
              options.vaultKeyGeneration ??
              currentVaultSnapshot.metadata.vaultKeyGeneration,
          },
          keySlots: options.keySlots ?? currentVaultSnapshot.keySlots,
          content: values.encryptedVault,
          signature: values.snapshotSignature,
        };
        const vectorDigestComponent = Object.entries(
          persistedVaultSnapshot.metadata.snapshotVersionVector,
        )
          .sort(([leftDeviceId], [rightDeviceId]) =>
            leftDeviceId.localeCompare(rightDeviceId),
          )
          .map(([deviceId, revision]) => `${deviceId}:${revision}`)
          .join(",");
        const persistedSnapshotDigest = `${values.vaultSnapshotDigest}:persisted:${persistedVaultSnapshot.metadata.revisionTimestamp}:${persistedVaultSnapshot.metadata.vaultKeyGeneration}:${vectorDigestComponent}`;
        const persistedCheckpoint = {
          ...values.localVaultTrustCheckpoint,
          payload: {
            ...values.localVaultTrustCheckpoint.payload,
            vaultKeyGeneration:
              persistedVaultSnapshot.metadata.vaultKeyGeneration,
            snapshotVersionVector:
              persistedVaultSnapshot.metadata.snapshotVersionVector,
            snapshotDigest: persistedSnapshotDigest,
          },
        };
        ports.saved.vaultSnapshot = persistedVaultSnapshot;
        ports.saved.vaultSnapshotDigest = persistedSnapshotDigest;
        ports.saved.localVaultTrustCheckpoint = persistedCheckpoint;
        snapshotRestoreStates.set(persistedVaultSnapshot, {
          snapshotDigest: persistedSnapshotDigest,
          checkpoint: persistedCheckpoint,
        });

        return {
          snapshotVersionVector:
            persistedVaultSnapshot.metadata.snapshotVersionVector,
          revisionTimestamp: persistedVaultSnapshot.metadata.revisionTimestamp,
          trustedSnapshotContext: {
            snapshotDigest: persistedSnapshotDigest,
            trust: values.verifiedVaultTrustState,
          },
          snapshot: persistedVaultSnapshot,
        };
      },
    ),
  } as unknown as VaultSnapshotService;
}
