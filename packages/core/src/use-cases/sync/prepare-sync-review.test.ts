import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import { createUnlockedVaultWithEntries } from "../../__tests__/fixtures/vault-entries";
import {
  InvalidVaultSyncReviewError,
  LocalVaultSnapshotAheadError,
  RemoteVaultSnapshotChangedError,
  RemoteVaultSnapshotIntegrityError,
  RemoteVaultSnapshotNotFoundError,
  SyncNotConfiguredError,
} from "../../errors/sync.errors";
import { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import { VaultMustBeUnlockedError } from "../../errors/vault-session.errors";
import { CURRENT_ALGORITHM_SUITE } from "../../domain/crypto/algorithm-suite.const";
import type { PasswordEntry } from "../../domain/entry/password-entry.type";
import type { VaultSnapshot } from "../../domain/snapshot/vault-snapshot";
import type { VaultSnapshotDescriptor } from "../../domain/snapshot/vault-snapshot-descriptor.type";
import type { Vault } from "../../domain/vault/vault";
import { VaultSnapshotVersionMismatchError } from "../../errors/vault-snapshot.errors";
import { PrepareSyncReviewUseCase } from "./prepare-sync-review";

function createSnapshot(
  values: ReturnType<typeof createCoreTestValues>,
  overrides: Partial<VaultSnapshot["metadata"]> = {},
): VaultSnapshot {
  return {
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
      ...overrides,
    },
    keySlots: {
      deviceSlots: [
        {
          deviceId: values.deviceId,
          protectedVaultMasterKey: values.protectedDeviceVaultMasterKey,
          publicSignKey: values.devicePublicSignKey,
        },
      ],
      recoveryKeySlot: {
        protectedVaultMasterKey: values.protectedRecoveryVaultMasterKey,
      },
    },
    content: values.encryptedVault,
    signature: values.snapshotSignature,
  };
}

function createEntry(
  id: string,
  versionVector: Record<string, number>,
): PasswordEntry {
  return {
    id,
    login: `${id}@example.com`,
    password: `${id}-password`,
    sanitizedUrl: `https://${id}.example.com`,
    tags: [],
    versionVector,
  };
}

function createRemoteSnapshotDescriptor(
  values: ReturnType<typeof createCoreTestValues>,
  overrides: Partial<VaultSnapshotDescriptor> = {},
): VaultSnapshotDescriptor {
  return {
    vaultId: values.vaultId,
    snapshotVersionVector: {
      [values.deviceId]: 1,
    },
    revisionTimestamp: values.timestamp,
    ...overrides,
  };
}

function createContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  const unlockedVault = createUnlockedVaultWithEntries(values, []);
  const localSnapshot = createSnapshot(values, {
    snapshotVersionVector: {
      [values.deviceId]: 3,
    },
    revisionTimestamp: values.timestamp,
  });

  ports.saved.unlockedVaultSession = {
    unlockedVault: {
      ...unlockedVault,
      vault: {
        ...unlockedVault.vault,
        syncConfig: values.syncConfig,
        versionVector: {
          [values.deviceId]: 3,
        },
      },
    },
    sourceSnapshotVersionVector: {
      [values.deviceId]: 3,
    },
  };
  ports.saved.vaultSnapshot = localSnapshot;
  const vaultSnapshot = new VaultSnapshotService(
    ports.crypto,
    ports.clock,
    ports.vaultLocalRepository,
  );

  return {
    values,
    ports,
    saved: ports.saved,
    localSnapshot,
    useCase: new PrepareSyncReviewUseCase(
      ports.sessionServices.unlockedVaultSession,
      ports.syncProvider,
      vaultSnapshot,
    ),
  };
}

describe("PrepareSyncReviewUseCase", () => {
  it("prepares a remote-ahead review with the descriptor needed for apply", async () => {
    const ctx = createContext();
    const remoteEntry = createEntry("remote-entry", {
      [ctx.values.deviceId]: 4,
    });
    const remoteVault: Vault = {
      ...ctx.saved.unlockedVaultSession!.unlockedVault.vault,
      versionVector: {
        [ctx.values.deviceId]: 4,
      },
      entries: [remoteEntry],
    };
    const remoteSnapshotDescriptor = createRemoteSnapshotDescriptor(
      ctx.values,
      {
        snapshotVersionVector: {
          [ctx.values.deviceId]: 4,
        },
        revisionTimestamp: ctx.values.timestamp + 1,
      },
    );
    const remoteSnapshot = createSnapshot(ctx.values, {
      snapshotVersionVector: {
        [ctx.values.deviceId]: 4,
      },
      revisionTimestamp: ctx.values.timestamp + 1,
    });

    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce(remoteSnapshotDescriptor);
    vi.mocked(
      ctx.ports.syncProvider.downloadVaultSnapshot,
    ).mockResolvedValueOnce(remoteSnapshot);
    vi.mocked(
      ctx.ports.crypto.decryptVaultSnapshotContent,
    ).mockResolvedValueOnce(remoteVault);

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).resolves.toMatchObject({
      remoteSnapshotDescriptor,
      relation: "remote_ahead",
      review: {
        actionable: {
          entryReviews: [
            {
              entryId: "remote-entry",
              relation: "remote_only",
              preselectedAction: "use_remote",
              localEntry: {
                state: "missing",
              },
              remoteEntry: {
                entry: remoteEntry,
                state: "entry",
              },
            },
          ],
          tagReviews: [],
          deviceProfileReviews: [],
        },
        readOnly: {
          keySlotsChanges: {
            deviceSlots: {
              addedDeviceIds: [],
              removedDeviceIds: [],
              changedDeviceIds: [],
            },
            recoveryKeySlot: "same",
            enrollmentKeySlot: "missing",
            hasChanges: false,
          },
        },
      },
    });

    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
    expect(ctx.saved.vaultSnapshot).toBe(ctx.localSnapshot);
  });

  it("fails when the downloaded remote snapshot no longer matches the descriptor", async () => {
    const ctx = createContext();
    const remoteVault: Vault = {
      ...ctx.saved.unlockedVaultSession!.unlockedVault.vault,
      versionVector: {
        [ctx.values.deviceId]: 4,
      },
    };
    const remoteSnapshotDescriptor = createRemoteSnapshotDescriptor(
      ctx.values,
      {
        snapshotVersionVector: {
          [ctx.values.deviceId]: 4,
        },
        revisionTimestamp: ctx.values.timestamp + 1,
      },
    );
    const remoteSnapshot = createSnapshot(ctx.values, {
      snapshotVersionVector: {
        [ctx.values.deviceId]: 4,
      },
      revisionTimestamp: ctx.values.timestamp + 2,
    });

    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce(remoteSnapshotDescriptor);
    vi.mocked(
      ctx.ports.syncProvider.downloadVaultSnapshot,
    ).mockResolvedValueOnce(remoteSnapshot);
    vi.mocked(
      ctx.ports.crypto.decryptVaultSnapshotContent,
    ).mockResolvedValueOnce(remoteVault);

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotChangedError);

    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
    expect(ctx.saved.vaultSnapshot).toBe(ctx.localSnapshot);
  });

  it("returns no review when local and remote descriptors are equal", async () => {
    const ctx = createContext();
    const remoteSnapshotDescriptor = createRemoteSnapshotDescriptor(
      ctx.values,
      {
        snapshotVersionVector: {
          [ctx.values.deviceId]: 3,
        },
        revisionTimestamp: ctx.values.timestamp,
      },
    );

    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce(remoteSnapshotDescriptor);

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).resolves.toEqual({
      remoteSnapshotDescriptor,
      relation: "equal",
      review: null,
    });

    expect(ctx.ports.syncProvider.downloadVaultSnapshot).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
    expect(ctx.saved.vaultSnapshot).toBe(ctx.localSnapshot);
  });

  it("fails when equal vectors have different descriptors", async () => {
    const ctx = createContext();
    const remoteSnapshotDescriptor = createRemoteSnapshotDescriptor(
      ctx.values,
      {
        snapshotVersionVector: {
          [ctx.values.deviceId]: 3,
        },
        revisionTimestamp: ctx.values.timestamp + 1,
      },
    );

    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce(remoteSnapshotDescriptor);

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotIntegrityError);

    expect(ctx.ports.syncProvider.downloadVaultSnapshot).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
    expect(ctx.saved.vaultSnapshot).toBe(ctx.localSnapshot);
  });

  it("fails when the snapshot descriptor relation is broken", async () => {
    const ctx = createContext();
    ctx.saved.vaultSnapshot = createSnapshot(ctx.values, {
      snapshotVersionVector: {
        A: 7,
        B: 3,
      },
      revisionTimestamp: ctx.values.timestamp,
    });
    ctx.saved.unlockedVaultSession = {
      ...ctx.saved.unlockedVaultSession!,
      sourceSnapshotVersionVector: {
        A: 7,
        B: 3,
      },
    };
    const remoteSnapshotDescriptor = createRemoteSnapshotDescriptor(
      ctx.values,
      {
        snapshotVersionVector: {
          A: 2,
          B: 4,
        },
        revisionTimestamp: ctx.values.timestamp + 1,
      },
    );

    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce(remoteSnapshotDescriptor);

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotIntegrityError);

    expect(ctx.ports.syncProvider.downloadVaultSnapshot).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });

  it("fails when the prepared review contains a broken item relation", async () => {
    const ctx = createContext();
    const remoteDeviceId = "remote-device-id";
    const localEntry = createEntry("entry-id", {
      [ctx.values.deviceId]: 5,
    });
    const remoteEntry = createEntry("entry-id", {
      [ctx.values.deviceId]: 1,
      [remoteDeviceId]: 1,
    });
    const currentSession = ctx.saved.unlockedVaultSession!;

    ctx.saved.unlockedVaultSession = {
      ...currentSession,
      unlockedVault: {
        ...currentSession.unlockedVault,
        vault: {
          ...currentSession.unlockedVault.vault,
          entries: [localEntry],
        },
      },
    };

    const remoteVault: Vault = {
      ...ctx.saved.unlockedVaultSession.unlockedVault.vault,
      versionVector: {
        [ctx.values.deviceId]: 3,
        [remoteDeviceId]: 1,
      },
      entries: [remoteEntry],
    };
    const remoteSnapshotDescriptor = createRemoteSnapshotDescriptor(
      ctx.values,
      {
        snapshotVersionVector: {
          [ctx.values.deviceId]: 3,
          [remoteDeviceId]: 1,
        },
        revisionTimestamp: ctx.values.timestamp + 1,
      },
    );
    const remoteSnapshot = createSnapshot(ctx.values, {
      snapshotVersionVector: {
        [ctx.values.deviceId]: 3,
        [remoteDeviceId]: 1,
      },
      revisionTimestamp: ctx.values.timestamp + 1,
    });

    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce(remoteSnapshotDescriptor);
    vi.mocked(
      ctx.ports.syncProvider.downloadVaultSnapshot,
    ).mockResolvedValueOnce(remoteSnapshot);
    vi.mocked(
      ctx.ports.crypto.decryptVaultSnapshotContent,
    ).mockResolvedValueOnce(remoteVault);

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(InvalidVaultSyncReviewError);

    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });

  it("fails when the local snapshot is ahead of remote", async () => {
    const ctx = createContext();
    const remoteSnapshotDescriptor = createRemoteSnapshotDescriptor(
      ctx.values,
      {
        snapshotVersionVector: {
          [ctx.values.deviceId]: 2,
        },
        revisionTimestamp: ctx.values.timestamp - 1,
      },
    );

    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce(remoteSnapshotDescriptor);

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(LocalVaultSnapshotAheadError);

    expect(ctx.ports.syncProvider.downloadVaultSnapshot).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
    expect(ctx.saved.vaultSnapshot).toBe(ctx.localSnapshot);
  });

  it("fails before provider reads when the local snapshot changed outside the unlocked session", async () => {
    const ctx = createContext();
    ctx.saved.vaultSnapshot = createSnapshot(ctx.values, {
      snapshotVersionVector: {
        [ctx.values.deviceId]: 4,
      },
      revisionTimestamp: ctx.values.timestamp + 1,
    });

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(VaultSnapshotVersionMismatchError);

    expect(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.downloadVaultSnapshot).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });

  it("fails when no remote descriptor exists for review", async () => {
    const ctx = createContext();

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotNotFoundError);

    expect(ctx.saved.vaultSnapshot).toBe(ctx.localSnapshot);
  });

  it("fails before provider reads when the vault is not unlocked", async () => {
    const ctx = createContext();
    ctx.saved.unlockedVaultSession = undefined;

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(VaultMustBeUnlockedError);

    expect(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).not.toHaveBeenCalled();
  });

  it("fails before provider reads when sync is not configured", async () => {
    const ctx = createContext();
    ctx.saved.unlockedVaultSession = {
      unlockedVault: createUnlockedVaultWithEntries(ctx.values, []),
      sourceSnapshotVersionVector: {
        [ctx.values.deviceId]: 3,
      },
    };

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(SyncNotConfiguredError);

    expect(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).not.toHaveBeenCalled();
  });
});
