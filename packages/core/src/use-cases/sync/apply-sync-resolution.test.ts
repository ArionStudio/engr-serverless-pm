import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import { createUnlockedVaultWithEntries } from "../../__tests__/fixtures/vault-entries";
import { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import { CURRENT_ALGORITHM_SUITE } from "../../domain/crypto/algorithm-suite.const";
import type { PasswordEntry } from "../../domain/entry/password-entry.type";
import type { VaultSnapshot } from "../../domain/snapshot/vault-snapshot";
import type { VaultSnapshotDescriptor } from "../../domain/snapshot/vault-snapshot-descriptor.type";
import type { Vault } from "../../domain/vault/vault";
import {
  RemoteVaultSnapshotChangedError,
  SyncAlreadyResolvedError,
  SyncResolutionIncompleteError,
  SyncTrustChangeRequiresDeviceTrustFlowError,
} from "../../errors/sync.errors";
import { VaultSnapshotSignerNotTrustedError } from "../../errors/unlock-vault.errors";
import { ApplySyncResolutionUseCase } from "./apply-sync-resolution";

function createSnapshot(
  values: ReturnType<typeof createCoreTestValues>,
  overrides: Partial<VaultSnapshot> = {},
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
      ...overrides.metadata,
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
    ...overrides,
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
  const localVault = {
    ...values.decryptedVault,
    syncConfig: values.syncConfig,
    versionVector: {
      [values.deviceId]: 3,
    },
  };
  const localSnapshot = createSnapshot(values, {
    metadata: {
      id: values.vaultId,
      schemaVersion: 1,
      vaultCreationTimestamp: values.timestamp - 1_000,
      revisionTimestamp: values.timestamp,
      revision: 3,
      algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
      createdByDeviceId: values.deviceId,
    },
  });
  const vaultSnapshot = new VaultSnapshotService(
    ports.crypto,
    ports.clock,
    ports.vaultLocalRepository,
  );
  const persistUnlockedVault = vi.spyOn(vaultSnapshot, "persistUnlockedVault");
  ports.saved.unlockedVaultSession = {
    unlockedVault: {
      ...createUnlockedVaultWithEntries(values, []),
      vault: localVault,
    },
    sourceSnapshotRevision: 3,
  };
  ports.saved.vaultSnapshot = localSnapshot;

  return {
    values,
    ports,
    saved: ports.saved,
    localSnapshot,
    persistUnlockedVault,
    useCase: new ApplySyncResolutionUseCase(
      ports.syncProvider,
      ports.sessionServices.unlockedVaultSession,
      vaultSnapshot,
    ),
  };
}

describe("ApplySyncResolutionUseCase", () => {
  it("applies explicit resolutions, persists locally, commits session, and uploads", async () => {
    const ctx = createContext();
    const remoteEntry = createEntry("remote-entry", {
      "remote-device-id": 1,
    });
    const remoteVault: Vault = {
      ...ctx.saved.unlockedVaultSession!.unlockedVault.vault,
      versionVector: {
        [ctx.values.deviceId]: 3,
        "remote-device-id": 1,
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
      metadata: {
        id: ctx.values.vaultId,
        schemaVersion: 1,
        vaultCreationTimestamp: ctx.values.timestamp - 1_000,
        revisionTimestamp: ctx.values.timestamp + 1,
        revision: 4,
        algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
        createdByDeviceId: ctx.values.deviceId,
      },
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
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        remoteSnapshotDescriptor,
        resolution: {
          entryResolutions: [
            {
              kind: "password_entry",
              entryId: "remote-entry",
              action: "use_remote",
            },
          ],
          tagResolutions: [],
          deviceProfileResolutions: [],
        },
      }),
    ).resolves.toEqual({
      revision: 4,
      revisionTimestamp: ctx.values.timestamp,
    });

    expect(
      ctx.saved.unlockedVaultSession?.unlockedVault.vault.versionVector,
    ).toEqual({
      [ctx.values.deviceId]: 4,
      "remote-device-id": 1,
    });
    expect(ctx.saved.unlockedVaultSession?.unlockedVault.vault.entries).toEqual(
      [
        {
          ...remoteEntry,
          versionVector: {
            [ctx.values.deviceId]: 1,
            "remote-device-id": 1,
          },
        },
      ],
    );
    expect(ctx.persistUnlockedVault).toHaveBeenCalledWith(
      ctx.values.vaultId,
      expect.objectContaining({
        vault: expect.objectContaining({
          versionVector: {
            [ctx.values.deviceId]: 4,
            "remote-device-id": 1,
          },
        }),
      }),
      3,
    );
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).toHaveBeenCalledWith(
      ctx.values.syncConfig,
      ctx.saved.vaultSnapshot,
      remoteSnapshotDescriptor,
    );
  });

  it("fails before writing when the remote descriptor changed after review", async () => {
    const ctx = createContext();
    const reviewedDescriptor = createRemoteSnapshotDescriptor(ctx.values, {
      versionVector: {
        [ctx.values.deviceId]: 3,
        "remote-device-id": 1,
      },
    });
    const currentDescriptor = createRemoteSnapshotDescriptor(ctx.values, {
      versionVector: {
        [ctx.values.deviceId]: 3,
        "remote-device-id": 2,
      },
    });

    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce(currentDescriptor);

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        remoteSnapshotDescriptor: reviewedDescriptor,
        resolution: {
          entryResolutions: [],
          tagResolutions: [],
          deviceProfileResolutions: [],
        },
      }),
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotChangedError);

    expect(ctx.ports.syncProvider.downloadVaultSnapshot).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });

  it("requires changed sections to be resolved before writing", async () => {
    const ctx = createContext();
    const remoteVault: Vault = {
      ...ctx.saved.unlockedVaultSession!.unlockedVault.vault,
      versionVector: {
        [ctx.values.deviceId]: 3,
        "remote-device-id": 1,
      },
      tags: [
        {
          id: 1,
          name: "Remote",
          versionVector: {
            "remote-device-id": 1,
          },
        },
      ],
    };
    const remoteSnapshotDescriptor = createRemoteSnapshotDescriptor(
      ctx.values,
      {
        versionVector: remoteVault.versionVector,
      },
    );
    const remoteSnapshot = createSnapshot(ctx.values);

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
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        remoteSnapshotDescriptor,
        resolution: {
          entryResolutions: [],
          tagResolutions: [],
          deviceProfileResolutions: [],
        },
      }),
    ).rejects.toBeInstanceOf(SyncResolutionIncompleteError);

    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });

  it("fails with already-resolved error when there are no sync changes", async () => {
    const ctx = createContext();
    const remoteVault = ctx.saved.unlockedVaultSession!.unlockedVault.vault;
    const remoteSnapshotDescriptor = createRemoteSnapshotDescriptor(
      ctx.values,
      {
        versionVector: remoteVault.versionVector,
      },
    );
    const remoteSnapshot = createSnapshot(ctx.values);

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
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        remoteSnapshotDescriptor,
        resolution: {
          entryResolutions: [],
          tagResolutions: [],
          deviceProfileResolutions: [],
        },
      }),
    ).rejects.toBeInstanceOf(SyncAlreadyResolvedError);

    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });

  it("rejects remote snapshots signed by devices not trusted locally", async () => {
    const ctx = createContext();
    const remoteVault: Vault = {
      ...ctx.saved.unlockedVaultSession!.unlockedVault.vault,
      versionVector: {
        [ctx.values.deviceId]: 3,
        "remote-device-id": 1,
      },
      tags: [
        {
          id: 1,
          name: "Remote",
          versionVector: {
            "remote-device-id": 1,
          },
        },
      ],
    };
    const remoteSnapshotDescriptor = createRemoteSnapshotDescriptor(
      ctx.values,
      {
        versionVector: remoteVault.versionVector,
      },
    );
    const remoteSnapshot = createSnapshot(ctx.values, {
      metadata: {
        id: ctx.values.vaultId,
        schemaVersion: 1,
        vaultCreationTimestamp: ctx.values.timestamp - 1_000,
        revisionTimestamp: ctx.values.timestamp,
        revision: 4,
        algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
        createdByDeviceId: "remote-device-id",
      },
      trustedDevices: [
        {
          id: "remote-device-id",
          publicKeys: {
            signingKey: ctx.values.devicePublicSignKey,
          },
        },
      ],
    });

    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce(remoteSnapshotDescriptor);
    vi.mocked(
      ctx.ports.syncProvider.downloadVaultSnapshot,
    ).mockResolvedValueOnce(remoteSnapshot);

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        remoteSnapshotDescriptor,
        resolution: {
          entryResolutions: [],
          tagResolutions: [
            {
              kind: "tag",
              tagId: 1,
              action: "use_remote",
            },
          ],
          deviceProfileResolutions: [],
        },
      }),
    ).rejects.toBeInstanceOf(VaultSnapshotSignerNotTrustedError);

    expect(
      ctx.ports.crypto.verifyVaultSnapshotSignature,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });

  it("blocks trust-state changes from the generic sync resolution path", async () => {
    const ctx = createContext();
    const remoteVault: Vault = {
      ...ctx.saved.unlockedVaultSession!.unlockedVault.vault,
      versionVector: {
        [ctx.values.deviceId]: 3,
        "remote-device-id": 1,
      },
      tags: [
        {
          id: 1,
          name: "Remote",
          versionVector: {
            "remote-device-id": 1,
          },
        },
      ],
    };
    const remoteSnapshotDescriptor = createRemoteSnapshotDescriptor(
      ctx.values,
      {
        versionVector: remoteVault.versionVector,
      },
    );
    const remoteSnapshot = createSnapshot(ctx.values, {
      trustedDevices: [
        ...ctx.localSnapshot.trustedDevices,
        {
          id: "remote-device-id",
          publicKeys: {
            signingKey: ctx.values.devicePublicSignKey,
          },
        },
      ],
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
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        remoteSnapshotDescriptor,
        resolution: {
          entryResolutions: [],
          tagResolutions: [
            {
              kind: "tag",
              tagId: 1,
              action: "use_remote",
            },
          ],
          deviceProfileResolutions: [],
        },
      }),
    ).rejects.toBeInstanceOf(SyncTrustChangeRequiresDeviceTrustFlowError);

    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });
});
