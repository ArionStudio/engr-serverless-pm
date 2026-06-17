import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import { createUnlockedVaultWithEntries } from "../../__tests__/fixtures/vault-entries";
import { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import { CURRENT_ALGORITHM_SUITE } from "../../domain/crypto/algorithm-suite.const";
import type { CompletedDeviceEnrollmentProof } from "../../domain/device-trust";
import type { PasswordEntry } from "../../domain/entry/password-entry.type";
import type { EnrollmentKeySlot } from "../../domain/snapshot";
import type { VaultSnapshot } from "../../domain/snapshot/vault-snapshot";
import type { VaultSnapshotDescriptor } from "../../domain/snapshot/vault-snapshot-descriptor.type";
import type { Vault } from "../../domain/vault/vault";
import {
  InvalidSyncResolutionError,
  LocalVaultSnapshotAheadError,
  RemoteVaultSnapshotChangedError,
  RemoteVaultSnapshotIntegrityError,
  SyncAlreadyResolvedError,
  SyncConflictDetectedError,
  SyncResolutionIncompleteError,
  SyncTrustChangeRequiresDeviceTrustFlowError,
} from "../../errors/sync.errors";
import { VaultSnapshotSignerNotTrustedError } from "../../errors/unlock-vault.errors";
import { VaultSnapshotVersionMismatchError } from "../../errors/vault-snapshot.errors";
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
      snapshotVersionVector: {
        [values.deviceId]: 1,
      },
      algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
      createdByDeviceId: values.deviceId,
      ...overrides.metadata,
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
    snapshotVersionVector: {
      [values.deviceId]: 1,
    },
    revisionTimestamp: values.timestamp,
    ...overrides,
  };
}

function createEnrollmentKeySlot(
  values: ReturnType<typeof createCoreTestValues>,
): EnrollmentKeySlot {
  return {
    enrollmentId: values.enrollmentId,
    pendingDeviceId: values.pendingDeviceId,
    pendingDevicePublicSignKey: values.pendingDevicePublicSignKey,
    pendingDevicePublicSignKeyDigest: values.pendingDevicePublicSignKeyDigest,
    expiresAt: values.enrollmentExpiresAt,
    protectedVaultMasterKeyDigest:
      values.protectedEnrollmentVaultMasterKeyDigest,
    protectedVaultMasterKey: values.protectedEnrollmentVaultMasterKey,
    authorizedByDeviceId: values.deviceId,
    authorizerSignature: values.deviceEnrollmentAuthorizationSignature,
  };
}

function createCompletedEnrollmentProof(
  values: ReturnType<typeof createCoreTestValues>,
): CompletedDeviceEnrollmentProof {
  return {
    version: 1,
    vaultId: values.vaultId,
    enrollmentId: values.enrollmentId,
    pendingDeviceId: values.pendingDeviceId,
    pendingDevicePublicSignKeyDigest: values.pendingDevicePublicSignKeyDigest,
    expiresAt: values.enrollmentExpiresAt,
    protectedVaultMasterKeyDigest:
      values.protectedEnrollmentVaultMasterKeyDigest,
    authorizedByDeviceId: values.deviceId,
    authorizerSignature: values.deviceEnrollmentAuthorizationSignature,
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
      snapshotVersionVector: {
        [values.deviceId]: 3,
      },
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
  const restoreLocalVaultSnapshot = vi.spyOn(
    vaultSnapshot,
    "restoreLocalVaultSnapshot",
  );
  ports.saved.unlockedVaultSession = {
    unlockedVault: {
      ...createUnlockedVaultWithEntries(values, []),
      vault: localVault,
    },
    sourceSnapshotVersionVector: {
      [values.deviceId]: 3,
    },
  };
  ports.saved.vaultSnapshot = localSnapshot;

  return {
    values,
    ports,
    saved: ports.saved,
    localSnapshot,
    persistUnlockedVault,
    restoreLocalVaultSnapshot,
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
        snapshotVersionVector: {
          [ctx.values.deviceId]: 3,
          "remote-device-id": 1,
        },
        revisionTimestamp: ctx.values.timestamp + 1,
      },
    );
    const remoteSnapshot = createSnapshot(ctx.values, {
      metadata: {
        id: ctx.values.vaultId,
        schemaVersion: 1,
        vaultCreationTimestamp: ctx.values.timestamp - 1_000,
        revisionTimestamp: ctx.values.timestamp + 1,
        snapshotVersionVector: {
          [ctx.values.deviceId]: 3,
          "remote-device-id": 1,
        },
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
              entryId: "remote-entry",
              action: "use_remote",
            },
          ],
          tagResolutions: [],
          deviceProfileResolutions: [],
        },
      }),
    ).resolves.toEqual({
      snapshotVersionVector: {
        [ctx.values.deviceId]: 4,
        "remote-device-id": 1,
      },
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
      {
        [ctx.values.deviceId]: 3,
      },
      {
        baseSnapshotVersionVector: {
          [ctx.values.deviceId]: 3,
          "remote-device-id": 1,
        },
      },
    );
    expect(ctx.saved.vaultSnapshot?.metadata.snapshotVersionVector).toEqual({
      [ctx.values.deviceId]: 4,
      "remote-device-id": 1,
    });
    expect(ctx.saved.unlockedVaultSession?.sourceSnapshotVersionVector).toEqual(
      {
        [ctx.values.deviceId]: 4,
        "remote-device-id": 1,
      },
    );
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).toHaveBeenCalledWith(
      ctx.values.syncConfig,
      ctx.saved.vaultSnapshot,
      remoteSnapshotDescriptor,
    );
    expect(
      vi.mocked(ctx.ports.syncProvider.uploadVaultSnapshot).mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(ctx.ports.sessionServices.unlockedVaultSession.commit).mock
        .invocationCallOrder[0],
    );
  });

  it("applies a completed enrollment trust transition", async () => {
    const ctx = createContext();
    const localSnapshotWithEnrollment = createSnapshot(ctx.values, {
      metadata: ctx.localSnapshot.metadata,
      keySlots: {
        ...ctx.localSnapshot.keySlots,
        enrollmentKeySlot: createEnrollmentKeySlot(ctx.values),
      },
    });
    const enrolledDeviceProfile = {
      id: ctx.values.pendingDeviceId,
      name: "New laptop",
      createdAt: ctx.values.timestamp,
      versionVector: {
        [ctx.values.pendingDeviceId]: 1,
      },
    };
    const remoteVault: Vault = {
      ...ctx.saved.unlockedVaultSession!.unlockedVault.vault,
      versionVector: {
        [ctx.values.deviceId]: 3,
        [ctx.values.pendingDeviceId]: 1,
      },
      deviceProfiles: [enrolledDeviceProfile],
    };
    const remoteSnapshotDescriptor = createRemoteSnapshotDescriptor(
      ctx.values,
      {
        snapshotVersionVector: {
          [ctx.values.deviceId]: 3,
          [ctx.values.pendingDeviceId]: 1,
        },
        revisionTimestamp: ctx.values.timestamp + 1,
      },
    );
    const remoteSnapshot = createSnapshot(ctx.values, {
      metadata: {
        id: ctx.values.vaultId,
        schemaVersion: 1,
        vaultCreationTimestamp: ctx.values.timestamp - 1_000,
        revisionTimestamp: ctx.values.timestamp + 1,
        snapshotVersionVector: {
          [ctx.values.deviceId]: 3,
          [ctx.values.pendingDeviceId]: 1,
        },
        algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
        createdByDeviceId: ctx.values.pendingDeviceId,
      },
      keySlots: {
        deviceSlots: [
          ...ctx.localSnapshot.keySlots.deviceSlots,
          {
            deviceId: ctx.values.pendingDeviceId,
            protectedVaultMasterKey: ctx.values.protectedDeviceVaultMasterKey,
            publicSignKey: ctx.values.pendingDevicePublicSignKey,
          },
        ],
        recoveryKeySlot: ctx.localSnapshot.keySlots.recoveryKeySlot,
        completedEnrollments: [createCompletedEnrollmentProof(ctx.values)],
      },
    });

    ctx.saved.vaultSnapshot = localSnapshotWithEnrollment;
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
          deviceProfileResolutions: [
            {
              deviceId: ctx.values.pendingDeviceId,
              action: "use_remote",
            },
          ],
        },
      }),
    ).resolves.toEqual({
      snapshotVersionVector: {
        [ctx.values.deviceId]: 4,
        [ctx.values.pendingDeviceId]: 1,
      },
      revisionTimestamp: ctx.values.timestamp,
    });

    expect(ctx.persistUnlockedVault).toHaveBeenCalledWith(
      ctx.values.vaultId,
      expect.objectContaining({
        vault: expect.objectContaining({
          deviceProfiles: [
            {
              ...enrolledDeviceProfile,
              versionVector: {
                [ctx.values.deviceId]: 1,
                [ctx.values.pendingDeviceId]: 1,
              },
            },
          ],
        }),
      }),
      {
        [ctx.values.deviceId]: 3,
      },
      {
        baseSnapshotVersionVector: {
          [ctx.values.deviceId]: 3,
          [ctx.values.pendingDeviceId]: 1,
        },
        keySlots: remoteSnapshot.keySlots,
      },
    );
    expect(ctx.saved.vaultSnapshot?.keySlots).toEqual(remoteSnapshot.keySlots);
    expect(ctx.saved.vaultSnapshot?.metadata.createdByDeviceId).toBe(
      ctx.values.deviceId,
    );
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).toHaveBeenCalledWith(
      ctx.values.syncConfig,
      ctx.saved.vaultSnapshot,
      remoteSnapshotDescriptor,
    );
  });

  it("rejects a completed enrollment resolution that drops the enrolled device profile", async () => {
    const ctx = createContext();
    const localSnapshotWithEnrollment = createSnapshot(ctx.values, {
      metadata: ctx.localSnapshot.metadata,
      keySlots: {
        ...ctx.localSnapshot.keySlots,
        enrollmentKeySlot: createEnrollmentKeySlot(ctx.values),
      },
    });
    const remoteVault: Vault = {
      ...ctx.saved.unlockedVaultSession!.unlockedVault.vault,
      versionVector: {
        [ctx.values.deviceId]: 3,
        [ctx.values.pendingDeviceId]: 1,
      },
      deviceProfiles: [
        {
          id: ctx.values.pendingDeviceId,
          name: "New laptop",
          createdAt: ctx.values.timestamp,
          versionVector: {
            [ctx.values.pendingDeviceId]: 1,
          },
        },
      ],
    };
    const remoteSnapshotDescriptor = createRemoteSnapshotDescriptor(
      ctx.values,
      {
        snapshotVersionVector: {
          [ctx.values.deviceId]: 3,
          [ctx.values.pendingDeviceId]: 1,
        },
        revisionTimestamp: ctx.values.timestamp + 1,
      },
    );
    const remoteSnapshot = createSnapshot(ctx.values, {
      metadata: {
        id: ctx.values.vaultId,
        schemaVersion: 1,
        vaultCreationTimestamp: ctx.values.timestamp - 1_000,
        revisionTimestamp: ctx.values.timestamp + 1,
        snapshotVersionVector: {
          [ctx.values.deviceId]: 3,
          [ctx.values.pendingDeviceId]: 1,
        },
        algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
        createdByDeviceId: ctx.values.pendingDeviceId,
      },
      keySlots: {
        deviceSlots: [
          ...ctx.localSnapshot.keySlots.deviceSlots,
          {
            deviceId: ctx.values.pendingDeviceId,
            protectedVaultMasterKey: ctx.values.protectedDeviceVaultMasterKey,
            publicSignKey: ctx.values.pendingDevicePublicSignKey,
          },
        ],
        recoveryKeySlot: ctx.localSnapshot.keySlots.recoveryKeySlot,
        completedEnrollments: [createCompletedEnrollmentProof(ctx.values)],
      },
    });

    ctx.saved.vaultSnapshot = localSnapshotWithEnrollment;
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
          deviceProfileResolutions: [
            {
              deviceId: ctx.values.pendingDeviceId,
              action: "use_local",
            },
          ],
        },
      }),
    ).rejects.toBeInstanceOf(InvalidSyncResolutionError);

    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });

  it("restores the local snapshot and does not commit when resolved upload races", async () => {
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
        snapshotVersionVector: {
          [ctx.values.deviceId]: 3,
          "remote-device-id": 1,
        },
        revisionTimestamp: ctx.values.timestamp + 1,
      },
    );
    const remoteSnapshot = createSnapshot(ctx.values, {
      metadata: {
        id: ctx.values.vaultId,
        schemaVersion: 1,
        vaultCreationTimestamp: ctx.values.timestamp - 1_000,
        revisionTimestamp: ctx.values.timestamp + 1,
        snapshotVersionVector: {
          [ctx.values.deviceId]: 3,
          "remote-device-id": 1,
        },
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
    vi.mocked(ctx.ports.syncProvider.uploadVaultSnapshot).mockRejectedValueOnce(
      new RemoteVaultSnapshotChangedError(ctx.values.vaultId),
    );

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        remoteSnapshotDescriptor,
        resolution: {
          entryResolutions: [
            {
              entryId: "remote-entry",
              action: "use_remote",
            },
          ],
          tagResolutions: [],
          deviceProfileResolutions: [],
        },
      }),
    ).rejects.toBeInstanceOf(SyncConflictDetectedError);

    expect(ctx.restoreLocalVaultSnapshot).toHaveBeenCalledWith(
      ctx.localSnapshot,
    );
    expect(ctx.saved.vaultSnapshot).toBe(ctx.localSnapshot);
    expect(
      ctx.ports.sessionServices.unlockedVaultSession.commit,
    ).not.toHaveBeenCalled();
  });

  it("fails before writing when the remote descriptor changed after review", async () => {
    const ctx = createContext();
    const reviewedDescriptor = createRemoteSnapshotDescriptor(ctx.values, {
      snapshotVersionVector: {
        [ctx.values.deviceId]: 3,
        "remote-device-id": 1,
      },
    });
    const currentDescriptor = createRemoteSnapshotDescriptor(ctx.values, {
      snapshotVersionVector: {
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
        snapshotVersionVector: {
          [ctx.values.deviceId]: 3,
          "remote-device-id": 1,
        },
      },
    );
    const remoteSnapshot = createSnapshot(ctx.values, {
      metadata: {
        id: ctx.values.vaultId,
        schemaVersion: 1,
        vaultCreationTimestamp: ctx.values.timestamp - 1_000,
        revisionTimestamp: ctx.values.timestamp,
        snapshotVersionVector: {
          [ctx.values.deviceId]: 3,
          "remote-device-id": 1,
        },
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
        snapshotVersionVector: {
          [ctx.values.deviceId]: 3,
        },
      },
    );
    const remoteSnapshot = createSnapshot(ctx.values, {
      metadata: {
        id: ctx.values.vaultId,
        schemaVersion: 1,
        vaultCreationTimestamp: ctx.values.timestamp - 1_000,
        revisionTimestamp: ctx.values.timestamp,
        snapshotVersionVector: {
          [ctx.values.deviceId]: 3,
        },
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
    const remoteSnapshotDescriptor = createRemoteSnapshotDescriptor(
      ctx.values,
      {
        snapshotVersionVector: {
          [ctx.values.deviceId]: 3,
          "remote-device-id": 1,
        },
      },
    );
    const remoteSnapshot = createSnapshot(ctx.values, {
      metadata: {
        id: ctx.values.vaultId,
        schemaVersion: 1,
        vaultCreationTimestamp: ctx.values.timestamp - 1_000,
        revisionTimestamp: ctx.values.timestamp,
        snapshotVersionVector: {
          [ctx.values.deviceId]: 3,
          "remote-device-id": 1,
        },
        algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
        createdByDeviceId: "remote-device-id",
      },
      keySlots: {
        ...ctx.localSnapshot.keySlots,
        deviceSlots: [
          {
            deviceId: "remote-device-id",
            protectedVaultMasterKey: ctx.values.protectedDeviceVaultMasterKey,
            publicSignKey: ctx.values.devicePublicSignKey,
          },
        ],
      },
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
    ).toHaveBeenCalledOnce();
    expect(ctx.ports.crypto.verifyVaultSnapshotSignature).toHaveBeenCalledWith(
      ctx.localSnapshot,
      ctx.values.devicePublicSignKey,
    );
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });

  it("fails before provider reads when the local snapshot changed outside the unlocked session", async () => {
    const ctx = createContext();
    ctx.saved.vaultSnapshot = createSnapshot(ctx.values, {
      metadata: {
        id: ctx.values.vaultId,
        schemaVersion: 1,
        vaultCreationTimestamp: ctx.values.timestamp - 1_000,
        revisionTimestamp: ctx.values.timestamp + 1,
        snapshotVersionVector: {
          [ctx.values.deviceId]: 4,
        },
        algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
        createdByDeviceId: ctx.values.deviceId,
      },
    });

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        remoteSnapshotDescriptor: createRemoteSnapshotDescriptor(ctx.values, {
          snapshotVersionVector: {
            [ctx.values.deviceId]: 3,
            "remote-device-id": 1,
          },
        }),
        resolution: {
          entryResolutions: [],
          tagResolutions: [],
          deviceProfileResolutions: [],
        },
      }),
    ).rejects.toBeInstanceOf(VaultSnapshotVersionMismatchError);

    expect(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.downloadVaultSnapshot).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });

  it("fails before writing when the local snapshot is ahead of the reviewed remote descriptor", async () => {
    const ctx = createContext();
    ctx.saved.vaultSnapshot = createSnapshot(ctx.values, {
      metadata: {
        id: ctx.values.vaultId,
        schemaVersion: 1,
        vaultCreationTimestamp: ctx.values.timestamp - 1_000,
        revisionTimestamp: ctx.values.timestamp + 1,
        snapshotVersionVector: {
          [ctx.values.deviceId]: 4,
        },
        algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
        createdByDeviceId: ctx.values.deviceId,
      },
    });
    ctx.saved.unlockedVaultSession = {
      ...ctx.saved.unlockedVaultSession!,
      sourceSnapshotVersionVector: {
        [ctx.values.deviceId]: 4,
      },
    };
    const remoteSnapshotDescriptor = createRemoteSnapshotDescriptor(
      ctx.values,
      {
        snapshotVersionVector: {
          [ctx.values.deviceId]: 3,
        },
      },
    );

    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce(remoteSnapshotDescriptor);

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
    ).rejects.toBeInstanceOf(LocalVaultSnapshotAheadError);

    expect(ctx.ports.syncProvider.downloadVaultSnapshot).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });

  it("fails before writing when local and remote descriptors are broken", async () => {
    const ctx = createContext();
    ctx.saved.vaultSnapshot = createSnapshot(ctx.values, {
      metadata: {
        id: ctx.values.vaultId,
        schemaVersion: 1,
        vaultCreationTimestamp: ctx.values.timestamp - 1_000,
        revisionTimestamp: ctx.values.timestamp + 1,
        snapshotVersionVector: {
          [ctx.values.deviceId]: 4,
          A: 1,
        },
        algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
        createdByDeviceId: ctx.values.deviceId,
      },
    });
    ctx.saved.unlockedVaultSession = {
      ...ctx.saved.unlockedVaultSession!,
      sourceSnapshotVersionVector: {
        [ctx.values.deviceId]: 4,
        A: 1,
      },
    };
    const remoteSnapshotDescriptor = createRemoteSnapshotDescriptor(
      ctx.values,
      {
        snapshotVersionVector: {
          [ctx.values.deviceId]: 3,
          A: 2,
        },
      },
    );

    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce(remoteSnapshotDescriptor);

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
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotIntegrityError);

    expect(ctx.ports.syncProvider.downloadVaultSnapshot).not.toHaveBeenCalled();
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
        snapshotVersionVector: {
          [ctx.values.deviceId]: 3,
          "remote-device-id": 1,
        },
      },
    );
    const remoteSnapshot = createSnapshot(ctx.values, {
      metadata: {
        id: ctx.values.vaultId,
        schemaVersion: 1,
        vaultCreationTimestamp: ctx.values.timestamp - 1_000,
        revisionTimestamp: ctx.values.timestamp,
        snapshotVersionVector: {
          [ctx.values.deviceId]: 3,
          "remote-device-id": 1,
        },
        algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
        createdByDeviceId: ctx.values.deviceId,
      },
      keySlots: {
        ...ctx.localSnapshot.keySlots,
        deviceSlots: [
          ...ctx.localSnapshot.keySlots.deviceSlots,
          {
            deviceId: "remote-device-id",
            protectedVaultMasterKey: ctx.values.protectedDeviceVaultMasterKey,
            publicSignKey: ctx.values.devicePublicSignKey,
          },
        ],
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
          entryResolutions: [],
          tagResolutions: [
            {
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
