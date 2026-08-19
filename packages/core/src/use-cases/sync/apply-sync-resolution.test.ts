import { describe, expect, it, vi } from "vitest";
import { createUnlockVaultTestContext } from "../../__tests__/fixtures/unlock-vault";
import { captureVaultSnapshotFromNextSave } from "../../__tests__/fixtures/ports";
import {
  createUnlockedVaultWithEntries,
  singlePasswordEntry,
} from "../../__tests__/fixtures/vault-entries";
import {
  cloneVaultSnapshotIdentity,
  toVaultSnapshotDescriptor,
  toVaultSnapshotIdentity,
} from "../../domain/snapshot";
import type { EntryReviewResolution } from "../../domain/sync/entry-resolution.type";
import {
  InvalidSyncResolutionError,
  InvalidVaultSyncReviewError,
  RemoteVaultSnapshotChangedError,
  RemoteVaultSnapshotIntegrityError,
  SyncConflictDetectedError,
  SyncTrustChangeRequiresDeviceTrustFlowError,
} from "../../errors/sync.errors";
import { LocalVaultSnapshotChangedError } from "../../errors/vault-snapshot.errors";
import { VaultTrustStateInvalidError } from "../../errors/vault-trust.errors";
import { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import { VaultSyncGuardService } from "../../services/sync";
import { ApplySyncResolutionUseCase } from "./apply-sync-resolution";

function createContext() {
  const ctx = createUnlockVaultTestContext();
  const unlockedVault = createUnlockedVaultWithEntries(ctx.values, []);
  const remoteSnapshot = {
    ...ctx.vaultSnapshot,
    metadata: {
      ...ctx.vaultSnapshot.metadata,
      revisionTimestamp: ctx.values.timestamp + 1,
      snapshotVersionVector: { [ctx.values.deviceId]: 2 },
    },
  };
  ctx.saved.deviceSyncCredentialState =
    ctx.values.encryptedDeviceSyncCredentialState;
  ctx.saved.unlockedVaultSession = {
    sessionId: ctx.values.sessionId,
    unlockedVault: {
      ...unlockedVault,
      vault: {
        ...unlockedVault.vault,
        syncTarget: ctx.values.syncTarget,
      },
    },
    sourceSnapshotVersionVector:
      ctx.vaultSnapshot.metadata.snapshotVersionVector,
  };
  const remoteDescriptor = toVaultSnapshotDescriptor(
    ctx.values.vaultId,
    remoteSnapshot,
  );
  const localDescriptor = toVaultSnapshotDescriptor(
    ctx.values.vaultId,
    ctx.vaultSnapshot,
  );
  const localIdentity = toVaultSnapshotIdentity(
    ctx.values.vaultId,
    ctx.vaultSnapshot,
    ctx.values.vaultSnapshotDigest,
  );
  const remoteIdentity = toVaultSnapshotIdentity(
    ctx.values.vaultId,
    remoteSnapshot,
    ctx.values.vaultSnapshotDigest,
  );
  vi.mocked(
    ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
  ).mockResolvedValue(remoteDescriptor);
  vi.mocked(ctx.ports.syncProvider.downloadVaultSnapshot).mockResolvedValue(
    remoteSnapshot,
  );
  vi.mocked(ctx.ports.crypto.decryptVaultSnapshotContent).mockResolvedValue({
    ...unlockedVault.vault,
    versionVector: { [ctx.values.deviceId]: 2 },
    entries: [singlePasswordEntry],
    syncTarget: ctx.values.syncTarget,
  });
  const snapshotService = new VaultSnapshotService(
    ctx.ports.crypto,
    ctx.ports.clock,
    ctx.ports.vaultLocalRepository,
  );
  const guard = new VaultSyncGuardService(
    ctx.ports.syncProvider,
    snapshotService,
    ctx.ports.sessionServices.unlockedVaultSession,
    ctx.ports.crypto,
    ctx.ports.vaultLocalRepository,
  );
  const useCase = new ApplySyncResolutionUseCase(
    ctx.ports.syncProvider,
    ctx.ports.sessionServices.unlockedVaultSession,
    snapshotService,
    guard,
  );

  return {
    ...ctx,
    localDescriptor,
    localIdentity,
    remoteSnapshot,
    remoteDescriptor,
    remoteIdentity,
    useCase,
  };
}

describe("ApplySyncResolutionUseCase", () => {
  it("uploads the exact signed resolution persisted by the local save", async () => {
    const ctx = createContext();
    const getPersistedSnapshot = captureVaultSnapshotFromNextSave(ctx.ports);

    await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      reviewedSnapshotIdentities: {
        local: ctx.localIdentity,
        remote: ctx.remoteIdentity,
      },
      resolution: {
        entryResolutions: [
          { entryId: singlePasswordEntry.id, action: "use_remote" },
        ],
        tagResolutions: [],
        deviceProfileResolutions: [],
      },
    });

    const uploadedSnapshot = vi.mocked(
      ctx.ports.syncProvider.uploadVaultSnapshot,
    ).mock.calls[0]?.[1];
    expect(uploadedSnapshot).toBe(getPersistedSnapshot());
  });

  it("applies ordinary content resolution with local credentials", async () => {
    const ctx = createContext();

    const result = await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      reviewedSnapshotIdentities: {
        local: ctx.localIdentity,
        remote: ctx.remoteIdentity,
      },
      resolution: {
        entryResolutions: [
          { entryId: singlePasswordEntry.id, action: "use_remote" },
        ],
        tagResolutions: [],
        deviceProfileResolutions: [],
      },
    });

    expect(
      ctx.ports.saved.unlockedVaultSession?.unlockedVault.vault.entries,
    ).toContainEqual({
      ...singlePasswordEntry,
      versionVector: { [ctx.values.deviceId]: 2 },
    });
    const encryptedVault = vi
      .mocked(ctx.ports.crypto.encryptVaultSnapshotContent)
      .mock.calls.at(-1)?.[0];
    expect(encryptedVault?.providerCredentialRevocationPending).toBeUndefined();
    expect(encryptedVault?.entries).toContainEqual({
      ...singlePasswordEntry,
      versionVector: { [ctx.values.deviceId]: 2 },
    });
    const uploadedSnapshot = vi
      .mocked(ctx.ports.syncProvider.uploadVaultSnapshot)
      .mock.calls.at(-1)?.[1];
    expect(uploadedSnapshot).toEqual(ctx.ports.saved.vaultSnapshot);
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).toHaveBeenCalledWith(
      ctx.values.syncAccess,
      uploadedSnapshot,
      {
        descriptor: ctx.remoteDescriptor,
        snapshotDigest: ctx.values.vaultSnapshotDigest,
      },
    );
    expect(result.syncUpload).toBe("complete");
    const expectedSnapshotVersionVector = {
      ...result.snapshotVersionVector,
    };
    result.snapshotVersionVector[ctx.values.deviceId] = 99;
    expect(
      ctx.ports.saved.vaultSnapshot?.metadata.snapshotVersionVector,
    ).toEqual(expectedSnapshotVersionVector);
    expect(
      ctx.ports.saved.unlockedVaultSession?.sourceSnapshotVersionVector,
    ).toEqual(expectedSnapshotVersionVector);
  });

  it("rejects unsigned key-generation rotation through generic resolution", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.syncProvider.downloadVaultSnapshot).mockResolvedValue({
      ...ctx.remoteSnapshot,
      metadata: {
        ...ctx.remoteSnapshot.metadata,
        vaultKeyGeneration: 2,
      },
      keySlots: {
        deviceSlots: [
          {
            ...ctx.remoteSnapshot.keySlots.deviceSlots[0],
            vaultKeyGeneration: 2,
            envelope: {
              ...ctx.values.vaultKeyEnvelope,
              vaultKeyGeneration: 2,
            },
          },
        ],
      },
    });

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        reviewedSnapshotIdentities: {
          local: ctx.localIdentity,
          remote: ctx.remoteIdentity,
        },
        resolution: {
          entryResolutions: [
            { entryId: singlePasswordEntry.id, action: "use_remote" },
          ],
          tagResolutions: [],
          deviceProfileResolutions: [],
        },
      }),
    ).rejects.toBeInstanceOf(VaultTrustStateInvalidError);
  });

  it("routes a signed trust transition away from generic resolution", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.syncProvider.downloadVaultSnapshot).mockResolvedValue({
      ...ctx.remoteSnapshot,
      trustChain: {
        certificates: [
          ...ctx.remoteSnapshot.trustChain.certificates,
          {
            payload: {
              version: 1,
              vaultId: ctx.values.vaultId,
              generation: 1,
              vaultKeyGeneration: 1,
              previousCertificateDigest: ctx.values.vaultTrustCertificateDigest,
              authorizedByDeviceId: ctx.values.deviceId,
              trustedDevices: [
                ...ctx.values.verifiedVaultTrustState.trustedDevices,
                {
                  deviceId: ctx.values.pendingDeviceId,
                  publicSignKey: ctx.values.pendingDevicePublicSignKey,
                  publicVaultKey: ctx.values.pendingDevicePublicVaultKey,
                },
              ],
            },
            signature: ctx.values.vaultTrustCertificateSignature,
          },
        ],
      },
      keySlots: {
        deviceSlots: [
          ...ctx.remoteSnapshot.keySlots.deviceSlots,
          {
            deviceId: ctx.values.pendingDeviceId,
            vaultKeyGeneration: 1,
            envelope: ctx.values.pendingDeviceVaultKeyEnvelope,
          },
        ],
      },
    });

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        reviewedSnapshotIdentities: {
          local: ctx.localIdentity,
          remote: ctx.remoteIdentity,
        },
        resolution: {
          entryResolutions: [
            { entryId: singlePasswordEntry.id, action: "use_remote" },
          ],
          tagResolutions: [],
          deviceProfileResolutions: [],
        },
      }),
    ).rejects.toBeInstanceOf(SyncTrustChangeRequiresDeviceTrustFlowError);

    expect(ctx.ports.crypto.decryptVaultSnapshotContent).not.toHaveBeenCalled();
  });

  it("rejects when the remote descriptor changes after review", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValue({
      ...ctx.remoteDescriptor,
      revisionTimestamp: ctx.remoteDescriptor.revisionTimestamp + 1,
    });

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        reviewedSnapshotIdentities: {
          local: ctx.localIdentity,
          remote: ctx.remoteIdentity,
        },
        resolution: {
          entryResolutions: [
            { entryId: singlePasswordEntry.id, action: "use_remote" },
          ],
          tagResolutions: [],
          deviceProfileResolutions: [],
        },
      }),
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotChangedError);
  });

  it("rejects same-descriptor remote bytes that differ from the reviewed identity", async () => {
    const ctx = createContext();
    const verification = vi
      .spyOn(VaultSnapshotService.prototype, "verifyCandidateSnapshotTrust")
      .mockResolvedValue({
        chain: ctx.values.vaultTrustChain,
        state: ctx.values.verifiedVaultTrustState,
        snapshotDigest: "substituted-remote-snapshot-digest",
      });

    try {
      await expect(
        ctx.useCase.execute({
          vaultId: ctx.values.vaultId,
          reviewedSnapshotIdentities: {
            local: ctx.localIdentity,
            remote: ctx.remoteIdentity,
          },
          resolution: {
            entryResolutions: [
              { entryId: singlePasswordEntry.id, action: "use_remote" },
            ],
            tagResolutions: [],
            deviceProfileResolutions: [],
          },
        }),
      ).rejects.toBeInstanceOf(RemoteVaultSnapshotChangedError);
    } finally {
      verification.mockRestore();
    }

    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).not.toHaveBeenCalled();
  });

  it("authenticates an equal-descriptor remote before reporting it resolved", async () => {
    const ctx = createContext();
    const equalDescriptorSnapshot = {
      ...ctx.remoteSnapshot,
      metadata: {
        ...ctx.remoteSnapshot.metadata,
        revisionTimestamp: ctx.localDescriptor.revisionTimestamp,
        snapshotVersionVector: ctx.localDescriptor.snapshotVersionVector,
      },
    };
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValue(ctx.localDescriptor);
    vi.mocked(ctx.ports.syncProvider.downloadVaultSnapshot).mockResolvedValue(
      equalDescriptorSnapshot,
    );
    const verification = vi
      .spyOn(VaultSnapshotService.prototype, "verifyCandidateSnapshotTrust")
      .mockResolvedValue({
        chain: ctx.values.vaultTrustChain,
        state: ctx.values.verifiedVaultTrustState,
        snapshotDigest: "substituted-equal-remote-digest",
      });

    try {
      await expect(
        ctx.useCase.execute({
          vaultId: ctx.values.vaultId,
          reviewedSnapshotIdentities: {
            local: ctx.localIdentity,
            remote: {
              descriptor: ctx.localDescriptor,
              snapshotDigest: ctx.values.vaultSnapshotDigest,
            },
          },
          resolution: {
            entryResolutions: [],
            tagResolutions: [],
            deviceProfileResolutions: [],
          },
        }),
      ).rejects.toBeInstanceOf(RemoteVaultSnapshotChangedError);
    } finally {
      verification.mockRestore();
    }

    expect(ctx.ports.syncProvider.downloadVaultSnapshot).toHaveBeenCalledOnce();
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).not.toHaveBeenCalled();
  });

  it("rejects a reviewed descriptor from another vault before provider access", async () => {
    const ctx = createContext();

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        reviewedSnapshotIdentities: {
          local: ctx.localIdentity,
          remote: {
            ...ctx.remoteIdentity,
            descriptor: {
              ...ctx.remoteIdentity.descriptor,
              vaultId: "other-vault-id",
            },
          },
        },
        resolution: {
          entryResolutions: [
            { entryId: singlePasswordEntry.id, action: "use_remote" },
          ],
          tagResolutions: [],
          deviceProfileResolutions: [],
        },
      }),
    ).rejects.toBeInstanceOf(InvalidSyncResolutionError);

    expect(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.downloadVaultSnapshot).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });

  it("captures reviewed inputs before asynchronous work", async () => {
    const ctx = createContext();
    const entryResolution: EntryReviewResolution = {
      entryId: singlePasswordEntry.id,
      action: "use_remote",
    };
    const command = {
      vaultId: ctx.values.vaultId,
      reviewedSnapshotIdentities: {
        local: cloneVaultSnapshotIdentity(ctx.localIdentity),
        remote: cloneVaultSnapshotIdentity(ctx.remoteIdentity),
      },
      resolution: {
        entryResolutions: [entryResolution],
        tagResolutions: [],
        deviceProfileResolutions: [],
      },
    };
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockImplementationOnce(async () => {
      command.reviewedSnapshotIdentities.local.descriptor.snapshotVersionVector[
        ctx.values.deviceId
      ] = 99;
      command.reviewedSnapshotIdentities.remote.descriptor.snapshotVersionVector[
        ctx.values.deviceId
      ] = 99;
      command.resolution.entryResolutions[0] = {
        entryId: singlePasswordEntry.id,
        action: "use_local",
      };

      return ctx.remoteDescriptor;
    });

    await expect(ctx.useCase.execute(command)).resolves.toMatchObject({
      revisionTimestamp: ctx.values.timestamp,
    });
    expect(
      ctx.ports.saved.unlockedVaultSession?.unlockedVault.vault.entries,
    ).toContainEqual({
      ...singlePasswordEntry,
      versionVector: { [ctx.values.deviceId]: 2 },
    });
  });

  it("rejects a provider mutation of its download descriptor argument", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.syncProvider.downloadVaultSnapshot,
    ).mockImplementationOnce(async (_syncAccess, descriptor) => {
      descriptor.snapshotVersionVector[ctx.values.deviceId] = 3;

      return {
        ...ctx.remoteSnapshot,
        metadata: {
          ...ctx.remoteSnapshot.metadata,
          snapshotVersionVector: { [ctx.values.deviceId]: 3 },
        },
      };
    });

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        reviewedSnapshotIdentities: {
          local: ctx.localIdentity,
          remote: ctx.remoteIdentity,
        },
        resolution: {
          entryResolutions: [
            { entryId: singlePasswordEntry.id, action: "use_remote" },
          ],
          tagResolutions: [],
          deviceProfileResolutions: [],
        },
      }),
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotChangedError);

    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).not.toHaveBeenCalled();
  });

  it("rejects when the local descriptor changes after review", async () => {
    const ctx = createContext();

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        reviewedSnapshotIdentities: {
          local: {
            ...ctx.localIdentity,
            descriptor: {
              ...ctx.localIdentity.descriptor,
              revisionTimestamp:
                ctx.localIdentity.descriptor.revisionTimestamp - 1,
            },
          },
          remote: ctx.remoteIdentity,
        },
        resolution: {
          entryResolutions: [
            { entryId: singlePasswordEntry.id, action: "use_remote" },
          ],
          tagResolutions: [],
          deviceProfileResolutions: [],
        },
      }),
    ).rejects.toBeInstanceOf(LocalVaultSnapshotChangedError);

    expect(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).not.toHaveBeenCalled();
  });

  it("rejects a remote sync target change before applying resolution", async () => {
    const ctx = createContext();
    const session = ctx.saved.unlockedVaultSession;

    if (session === undefined) {
      throw new Error("Expected an unlocked test session.");
    }

    vi.mocked(ctx.ports.crypto.decryptVaultSnapshotContent).mockResolvedValue({
      ...session.unlockedVault.vault,
      versionVector: { [ctx.values.deviceId]: 2 },
      entries: [singlePasswordEntry],
      syncTarget: {
        ...ctx.values.syncTarget,
        targetConfig: { bucket: "another-bucket" },
      },
    });

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        reviewedSnapshotIdentities: {
          local: ctx.localIdentity,
          remote: ctx.remoteIdentity,
        },
        resolution: {
          entryResolutions: [
            { entryId: singlePasswordEntry.id, action: "use_remote" },
          ],
          tagResolutions: [],
          deviceProfileResolutions: [],
        },
      }),
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotIntegrityError);

    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });

  it("applies signed provider credential revocation completion without content resolutions", async () => {
    const ctx = createContext();
    const session = ctx.saved.unlockedVaultSession;

    if (session === undefined) {
      throw new Error("Expected an unlocked test session.");
    }

    ctx.saved.unlockedVaultSession = {
      ...session,
      unlockedVault: {
        ...session.unlockedVault,
        vault: {
          ...session.unlockedVault.vault,
          providerCredentialRevocationPending: {
            revokedDeviceIds: [ctx.values.pendingDeviceId],
            vaultKeyGeneration: 1,
          },
        },
      },
    };
    vi.mocked(ctx.ports.crypto.decryptVaultSnapshotContent).mockResolvedValue({
      ...session.unlockedVault.vault,
      versionVector: { [ctx.values.deviceId]: 2 },
    });

    const result = await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      reviewedSnapshotIdentities: {
        local: ctx.localIdentity,
        remote: ctx.remoteIdentity,
      },
      resolution: {
        entryResolutions: [],
        tagResolutions: [],
        deviceProfileResolutions: [],
      },
    });

    expect(
      ctx.ports.saved.unlockedVaultSession?.unlockedVault.vault
        .providerCredentialRevocationPending,
    ).toBeUndefined();
    expect(ctx.ports.saved.vaultSnapshot).toEqual(ctx.remoteSnapshot);
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
    expect(result.syncUpload).toBe("complete");
    const expectedSnapshotVersionVector = {
      ...result.snapshotVersionVector,
    };
    result.snapshotVersionVector[ctx.values.deviceId] = 99;
    expect(
      ctx.ports.saved.vaultSnapshot?.metadata.snapshotVersionVector,
    ).toEqual(expectedSnapshotVersionVector);
    expect(
      ctx.ports.saved.unlockedVaultSession?.sourceSnapshotVersionVector,
    ).toEqual(expectedSnapshotVersionVector);
  });

  it("clears provider credential revocation while applying content resolution", async () => {
    const ctx = createContext();
    const session = ctx.saved.unlockedVaultSession;

    if (session === undefined) {
      throw new Error("Expected an unlocked test session.");
    }

    ctx.saved.unlockedVaultSession = {
      ...session,
      unlockedVault: {
        ...session.unlockedVault,
        vault: {
          ...session.unlockedVault.vault,
          providerCredentialRevocationPending: {
            revokedDeviceIds: [ctx.values.pendingDeviceId],
            vaultKeyGeneration: 1,
          },
        },
      },
    };

    await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      reviewedSnapshotIdentities: {
        local: ctx.localIdentity,
        remote: ctx.remoteIdentity,
      },
      resolution: {
        entryResolutions: [
          { entryId: singlePasswordEntry.id, action: "use_remote" },
        ],
        tagResolutions: [],
        deviceProfileResolutions: [],
      },
    });

    expect(
      ctx.ports.saved.unlockedVaultSession?.unlockedVault.vault
        .providerCredentialRevocationPending,
    ).toBeUndefined();
    expect(
      ctx.ports.saved.unlockedVaultSession?.unlockedVault.vault.entries,
    ).toContainEqual({
      ...singlePasswordEntry,
      versionVector: { [ctx.values.deviceId]: 2 },
    });
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).toHaveBeenCalledWith(
      ctx.values.syncAccess,
      expect.anything(),
      {
        descriptor: ctx.remoteDescriptor,
        snapshotDigest: ctx.values.vaultSnapshotDigest,
      },
    );
  });

  it("rejects invalid profile trust state before persistence", async () => {
    const ctx = createContext();
    const session = ctx.saved.unlockedVaultSession;

    if (session === undefined) {
      throw new Error("Expected an unlocked test session.");
    }

    vi.mocked(ctx.ports.crypto.decryptVaultSnapshotContent).mockResolvedValue({
      ...session.unlockedVault.vault,
      versionVector: { [ctx.values.deviceId]: 2 },
      entries: [singlePasswordEntry],
      deviceProfiles: [],
      deletedDeviceProfiles: [
        {
          id: ctx.values.deviceId,
          deletedAt: ctx.values.timestamp + 1,
          versionVector: { [ctx.values.deviceId]: 2 },
        },
      ],
    });

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        reviewedSnapshotIdentities: {
          local: ctx.localIdentity,
          remote: ctx.remoteIdentity,
        },
        resolution: {
          entryResolutions: [
            { entryId: singlePasswordEntry.id, action: "use_remote" },
          ],
          tagResolutions: [],
          deviceProfileResolutions: [],
        },
      }),
    ).rejects.toBeInstanceOf(InvalidVaultSyncReviewError);

    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });

  it("keeps the resolved snapshot and reports pending when upload outcome is unknown", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.syncProvider.uploadVaultSnapshot).mockResolvedValueOnce(
      {
        status: "outcome_unknown",
      },
    );

    const result = await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      reviewedSnapshotIdentities: {
        local: ctx.localIdentity,
        remote: ctx.remoteIdentity,
      },
      resolution: {
        entryResolutions: [
          { entryId: singlePasswordEntry.id, action: "use_remote" },
        ],
        tagResolutions: [],
        deviceProfileResolutions: [],
      },
    });

    expect(result.syncUpload).toBe("pending");
    expect(ctx.ports.saved.vaultSnapshot).not.toBe(ctx.vaultSnapshot);
    expect(
      ctx.ports.saved.unlockedVaultSession?.unlockedVault.vault.entries,
    ).toContainEqual({
      ...singlePasswordEntry,
      versionVector: { [ctx.values.deviceId]: 2 },
    });
    expect(
      ctx.ports.sessionServices.unlockedVaultSession
        .commitPersistedSnapshotIfSessionIsActive,
    ).toHaveBeenCalledOnce();
  });

  it("restores the reviewed local snapshot when upload is definitely not committed", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.syncProvider.uploadVaultSnapshot).mockResolvedValueOnce(
      {
        status: "definitely_not_committed",
        reason: "remote_snapshot_changed",
      },
    );

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        reviewedSnapshotIdentities: {
          local: ctx.localIdentity,
          remote: ctx.remoteIdentity,
        },
        resolution: {
          entryResolutions: [
            { entryId: singlePasswordEntry.id, action: "use_remote" },
          ],
          tagResolutions: [],
          deviceProfileResolutions: [],
        },
      }),
    ).rejects.toBeInstanceOf(SyncConflictDetectedError);

    expect(ctx.ports.saved.vaultSnapshot).toEqual(ctx.vaultSnapshot);
    expect(
      ctx.ports.sessionServices.unlockedVaultSession.commitPersistedSnapshot,
    ).not.toHaveBeenCalled();
  });
});
