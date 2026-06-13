import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import { createUnlockedVaultWithEntries } from "../../__tests__/fixtures/vault-entries";
import {
  RemoteVaultSnapshotNotFoundError,
  SyncNotConfiguredError,
} from "../../services/errors/sync.errors";
import { VaultSyncReviewService } from "../../services/sync/vault-sync-review.service";
import { VaultMustBeUnlockedError } from "../../services/errors/vault-session.errors";
import { CURRENT_ALGORITHM_SUITE } from "../../domain/crypto/algorithm-suite.const";
import type { PasswordEntry } from "../../domain/entry/password-entry.type";
import type { VaultSnapshot } from "../../domain/snapshot/vault-snapshot";
import type { RemoteVaultSnapshotDescriptor } from "../../domain/sync/remote-vault-snapshot-descriptor.type";
import type { Vault } from "../../domain/vault/vault";
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
      revision: 1,
      algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
      createdByDeviceId: values.deviceId,
      ...overrides,
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
  overrides: Partial<RemoteVaultSnapshotDescriptor> = {},
): RemoteVaultSnapshotDescriptor {
  return {
    vaultId: values.vaultId,
    versionVector: {
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
    revision: 3,
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
    sourceSnapshotRevision: 1,
  };
  ports.saved.vaultSnapshot = localSnapshot;

  return {
    values,
    ports,
    saved: ports.saved,
    localSnapshot,
    useCase: new PrepareSyncReviewUseCase(
      ports.sessionServices.unlockedVaultSession,
      new VaultSyncReviewService(
        ports.syncProvider,
        ports.vaultLocalRepository,
        ports.crypto,
      ),
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
        versionVector: remoteVault.versionVector,
        revisionTimestamp: ctx.values.timestamp + 1,
      },
    );
    const remoteSnapshot = createSnapshot(ctx.values, {
      revision: 4,
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
        hasChanges: true,
        hasConflicts: false,
        entryReviews: [
          {
            kind: "password_entry",
            entryId: "remote-entry",
            relation: "remote_only",
            conflict: false,
            preselectedAction: "use_remote",
          },
        ],
      },
    });

    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
    expect(ctx.saved.vaultSnapshot).toBe(ctx.localSnapshot);
  });

  it("skips full download when local is safely ahead of remote", async () => {
    const ctx = createContext();
    const remoteSnapshotDescriptor = createRemoteSnapshotDescriptor(
      ctx.values,
      {
        versionVector: {
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
    ).resolves.toMatchObject({
      remoteSnapshotDescriptor,
      relation: "local_ahead",
      review: {
        hasChanges: false,
        hasConflicts: false,
        entryReviews: [],
      },
    });

    expect(ctx.ports.syncProvider.downloadVaultSnapshot).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
    expect(ctx.saved.vaultSnapshot).toBe(ctx.localSnapshot);
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
      sourceSnapshotRevision: 1,
    };

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(SyncNotConfiguredError);

    expect(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).not.toHaveBeenCalled();
  });
});
