import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import { createUnlockedVaultWithEntries } from "../../__tests__/fixtures/vault-entries";
import { CURRENT_ALGORITHM_SUITE } from "../../domain/crypto/algorithm-suite.const";
import type { VaultSnapshot } from "../../domain/snapshot/vault-snapshot";
import type { VaultSnapshotDescriptor } from "../../domain/snapshot/vault-snapshot-descriptor.type";
import {
  RemoteVaultSnapshotAheadError,
  RemoteVaultSnapshotChangedError,
  RemoteVaultSnapshotIntegrityError,
  SyncConflictDetectedError,
  SyncNotConfiguredError,
} from "../../errors/sync.errors";
import { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import { VaultSnapshotNotFoundError } from "../../errors/unlock-vault.errors";
import { VaultMustBeUnlockedError } from "../../errors/vault-session.errors";
import { VaultSnapshotVersionMismatchError } from "../../errors/vault-snapshot.errors";
import { SyncUploadUseCase } from "./sync-upload";

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
    },
    content: values.encryptedVault,
    signature: values.snapshotSignature,
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
    useCase: new SyncUploadUseCase(
      ports.syncProvider,
      ports.sessionServices.unlockedVaultSession,
      vaultSnapshot,
    ),
  };
}

describe("SyncUploadUseCase", () => {
  it("uploads the local snapshot when local is ahead of the remote descriptor", async () => {
    const ctx = createContext();
    const remoteSnapshotDescriptor = createRemoteSnapshotDescriptor(
      ctx.values,
      {
        snapshotVersionVector: {
          [ctx.values.deviceId]: 2,
        },
        revisionTimestamp: ctx.values.timestamp + 10_000,
      },
    );

    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce(remoteSnapshotDescriptor);

    await ctx.useCase.execute({ vaultId: ctx.values.vaultId });

    expect(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).toHaveBeenCalledWith(ctx.values.syncConfig, ctx.values.vaultId);
    expect(ctx.ports.syncProvider.downloadVaultSnapshot).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).toHaveBeenCalledWith(
      ctx.values.syncConfig,
      ctx.localSnapshot,
      remoteSnapshotDescriptor,
    );
    expect(ctx.saved.vaultSnapshot).toBe(ctx.localSnapshot);
  });

  it("uploads the local snapshot when no remote descriptor exists", async () => {
    const ctx = createContext();

    await ctx.useCase.execute({ vaultId: ctx.values.vaultId });

    expect(ctx.ports.syncProvider.uploadVaultSnapshot).toHaveBeenCalledWith(
      ctx.values.syncConfig,
      ctx.localSnapshot,
      null,
    );
  });

  it("skips upload when the remote descriptor already matches the vault", async () => {
    const ctx = createContext();
    const localSnapshot = createSnapshot(ctx.values, {
      id: "snapshot-id",
      snapshotVersionVector: {
        [ctx.values.deviceId]: 3,
      },
      revisionTimestamp: ctx.values.timestamp,
    });
    vi.mocked(
      ctx.ports.vaultLocalRepository.getVaultSnapshot,
    ).mockResolvedValueOnce(localSnapshot);
    const remoteSnapshotDescriptor = createRemoteSnapshotDescriptor(
      ctx.values,
      {
        snapshotVersionVector: localSnapshot.metadata.snapshotVersionVector,
      },
    );

    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce(remoteSnapshotDescriptor);

    await ctx.useCase.execute({ vaultId: ctx.values.vaultId });

    expect(ctx.ports.syncProvider.downloadVaultSnapshot).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });

  it("uploads when local is ahead through more than the current device", async () => {
    const ctx = createContext();
    ctx.saved.vaultSnapshot = createSnapshot(ctx.values, {
      snapshotVersionVector: {
        [ctx.values.deviceId]: 3,
        "remote-device-id": 2,
      },
      revisionTimestamp: ctx.values.timestamp,
    });
    ctx.saved.unlockedVaultSession = {
      ...ctx.saved.unlockedVaultSession!,
      sourceSnapshotVersionVector:
        ctx.saved.vaultSnapshot.metadata.snapshotVersionVector,
    };
    const remoteSnapshotDescriptor = createRemoteSnapshotDescriptor(
      ctx.values,
      {
        snapshotVersionVector: {
          [ctx.values.deviceId]: 2,
          "remote-device-id": 1,
        },
      },
    );

    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce(remoteSnapshotDescriptor);

    await ctx.useCase.execute({ vaultId: ctx.values.vaultId });

    expect(ctx.ports.syncProvider.downloadVaultSnapshot).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).toHaveBeenCalledWith(
      ctx.values.syncConfig,
      ctx.saved.vaultSnapshot,
      remoteSnapshotDescriptor,
    );
  });

  it("blocks upload when the remote vector has a component ahead of local", async () => {
    const ctx = createContext();
    const remoteSnapshotDescriptor = createRemoteSnapshotDescriptor(
      ctx.values,
      {
        snapshotVersionVector: {
          [ctx.values.deviceId]: 3,
          "remote-device-id": 1,
        },
        revisionTimestamp: ctx.values.timestamp - 10_000,
      },
    );

    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce(remoteSnapshotDescriptor);

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotAheadError);

    expect(ctx.ports.syncProvider.downloadVaultSnapshot).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
    expect(ctx.saved.vaultSnapshot).toBe(ctx.localSnapshot);
  });

  it("fails integrity validation when the remote snapshot changed without a vector change", async () => {
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
  });

  it("fails when the remote snapshot changes during upload", async () => {
    const ctx = createContext();
    const remoteSnapshotDescriptor = createRemoteSnapshotDescriptor(
      ctx.values,
      {
        snapshotVersionVector: {
          [ctx.values.deviceId]: 2,
        },
      },
    );

    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce(remoteSnapshotDescriptor);
    vi.mocked(ctx.ports.syncProvider.uploadVaultSnapshot).mockRejectedValueOnce(
      new RemoteVaultSnapshotChangedError(ctx.values.vaultId),
    );

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(SyncConflictDetectedError);

    expect(ctx.ports.syncProvider.uploadVaultSnapshot).toHaveBeenCalledWith(
      ctx.values.syncConfig,
      ctx.localSnapshot,
      remoteSnapshotDescriptor,
    );
  });

  it("fails when the snapshot vector relation is broken", async () => {
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
      sourceSnapshotVersionVector:
        ctx.saved.vaultSnapshot.metadata.snapshotVersionVector,
    };
    const remoteSnapshotDescriptor = createRemoteSnapshotDescriptor(
      ctx.values,
      {
        snapshotVersionVector: {
          A: 2,
          B: 4,
        },
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
  });

  it("fails when the target vault is not unlocked", async () => {
    const ctx = createContext();
    ctx.saved.unlockedVaultSession = undefined;

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(VaultMustBeUnlockedError);

    expect(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).not.toHaveBeenCalled();
  });

  it("fails when sync is not configured", async () => {
    const ctx = createContext();
    ctx.saved.unlockedVaultSession = {
      unlockedVault: createUnlockedVaultWithEntries(ctx.values, []),
      sourceSnapshotVersionVector: {
        [ctx.values.deviceId]: 1,
      },
    };

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(SyncNotConfiguredError);

    expect(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).not.toHaveBeenCalled();
  });

  it("fails when the local snapshot is missing", async () => {
    const ctx = createContext();
    ctx.saved.vaultSnapshot = undefined;

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(VaultSnapshotNotFoundError);

    expect(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).not.toHaveBeenCalled();
  });

  it("fails when the local snapshot changed outside the unlocked session", async () => {
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
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });
});
