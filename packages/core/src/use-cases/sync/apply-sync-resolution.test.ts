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
import type { PasswordEntry } from "../../domain/entry/password-entry.type";
import type { EntryReviewResolution } from "../../domain/sync/entry-resolution.type";
import {
  InvalidSyncResolutionError,
  InvalidVaultSyncReviewError,
  RemoteVaultSnapshotChangedError,
  RemoteVaultSnapshotIntegrityError,
  SyncAlreadyResolvedError,
  SyncResolutionIncompleteError,
  SyncConflictDetectedError,
  SyncTrustChangeRequiresDeviceTrustFlowError,
} from "../../errors/sync.errors";
import { LocalVaultSnapshotChangedError } from "../../errors/vault-snapshot.errors";
import { VaultTrustStateInvalidError } from "../../errors/vault-trust.errors";
import { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import { VaultSyncGuardService } from "../../services/sync";
import { ApplySyncResolutionUseCase } from "./apply-sync-resolution";

function createContext(localEntries: PasswordEntry[] = []) {
  const ctx = createUnlockVaultTestContext();
  const unlockedVault = createUnlockedVaultWithEntries(
    ctx.values,
    localEntries,
  );
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
  const remoteVault = {
    ...unlockedVault.vault,
    versionVector: { [ctx.values.deviceId]: 2 },
    entries:
      localEntries.length === 0
        ? [singlePasswordEntry]
        : [
            {
              ...singlePasswordEntry,
              login: "remote@example.test",
              versionVector: { [ctx.values.deviceId]: 2 },
            },
          ],
    syncTarget: ctx.values.syncTarget,
  };
  vi.mocked(ctx.ports.crypto.decryptVaultSnapshotContent).mockResolvedValue(
    remoteVault,
  );
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
    remoteVault,
    remoteDescriptor,
    remoteIdentity,
    useCase,
  };
}

const localEntry = {
  ...singlePasswordEntry,
  versionVector: singlePasswordEntry.versionVector,
};

describe("ApplySyncResolutionUseCase", () => {
  it("adopts an entirely remote resolution without creating or uploading another revision", async () => {
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

    expect(ctx.saved.vaultSnapshot).toEqual(ctx.remoteSnapshot);
    expect(ctx.saved.unlockedVaultSession?.unlockedVault.vault.entries).toEqual(
      [singlePasswordEntry],
    );
    expect(result.snapshotVersionVector).toEqual(
      ctx.remoteDescriptor.snapshotVersionVector,
    );
    expect(result.revisionTimestamp).toBe(
      ctx.remoteDescriptor.revisionTimestamp,
    );
    expect(ctx.ports.crypto.encryptVaultSnapshotContent).not.toHaveBeenCalled();
    expect(ctx.ports.crypto.signVaultSnapshot).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });

  it("uploads the exact signed resolution persisted by the local save", async () => {
    const ctx = createContext([localEntry]);
    const getPersistedSnapshot = captureVaultSnapshotFromNextSave(ctx.ports);

    await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      reviewedSnapshotIdentities: {
        local: ctx.localIdentity,
        remote: ctx.remoteIdentity,
      },
      resolution: {
        entryResolutions: [
          { entryId: singlePasswordEntry.id, action: "use_local" },
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
    const ctx = createContext([localEntry]);

    const result = await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      reviewedSnapshotIdentities: {
        local: ctx.localIdentity,
        remote: ctx.remoteIdentity,
      },
      resolution: {
        entryResolutions: [
          { entryId: singlePasswordEntry.id, action: "use_local" },
        ],
        tagResolutions: [],
        deviceProfileResolutions: [],
      },
    });

    expect(
      ctx.ports.saved.unlockedVaultSession?.unlockedVault.vault.entries,
    ).toContainEqual({
      ...singlePasswordEntry,
      versionVector: { [ctx.values.deviceId]: 3 },
    });
    const encryptedVault = vi
      .mocked(ctx.ports.crypto.encryptVaultSnapshotContent)
      .mock.calls.at(-1)?.[0];
    expect(encryptedVault?.providerCredentialRevocationPending).toBeUndefined();
    expect(encryptedVault?.entries).toContainEqual({
      ...singlePasswordEntry,
      versionVector: { [ctx.values.deviceId]: 3 },
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

  it("rejects equal descriptors with different snapshot digests", async () => {
    const ctx = createContext();
    const remoteSnapshotDigest = "equal-descriptor-remote-snapshot-digest";
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
        snapshotDigest: remoteSnapshotDigest,
      });

    try {
      await expect(
        ctx.useCase.execute({
          vaultId: ctx.values.vaultId,
          reviewedSnapshotIdentities: {
            local: ctx.localIdentity,
            remote: {
              descriptor: ctx.localDescriptor,
              snapshotDigest: remoteSnapshotDigest,
            },
          },
          resolution: {
            entryResolutions: [],
            tagResolutions: [],
            deviceProfileResolutions: [],
          },
        }),
      ).rejects.toBeInstanceOf(RemoteVaultSnapshotIntegrityError);
    } finally {
      verification.mockRestore();
    }

    expect(ctx.ports.syncProvider.downloadVaultSnapshot).toHaveBeenCalledOnce();
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).not.toHaveBeenCalled();
  });

  it("reports fully equal snapshot identities as already resolved", async () => {
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
    ).rejects.toBeInstanceOf(SyncAlreadyResolvedError);

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
      revisionTimestamp: ctx.remoteDescriptor.revisionTimestamp,
    });
    expect(
      ctx.ports.saved.unlockedVaultSession?.unlockedVault.vault.entries,
    ).toContainEqual({
      ...singlePasswordEntry,
      versionVector: singlePasswordEntry.versionVector,
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
      versionVector: singlePasswordEntry.versionVector,
    });
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
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
    const ctx = createContext([localEntry]);
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
          { entryId: singlePasswordEntry.id, action: "use_local" },
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
      versionVector: { [ctx.values.deviceId]: 3 },
    });
    expect(
      ctx.ports.sessionServices.unlockedVaultSession
        .commitPersistedSnapshotIfSessionIsActive,
    ).toHaveBeenCalledOnce();
  });

  it("restores the reviewed local snapshot when upload is definitely not committed", async () => {
    const ctx = createContext([localEntry]);
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
            { entryId: singlePasswordEntry.id, action: "use_local" },
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
  it("adopts remote entry and tag tombstones plus a device profile without stamping them", async () => {
    const ctx = createContext([localEntry]);
    const remoteVault = {
      ...ctx.remoteVault,
      entries: [],
      deletedEntries: [
        {
          id: singlePasswordEntry.id,
          deletedAt: ctx.values.timestamp,
          versionVector: { [ctx.values.deviceId]: 2 },
        },
      ],
      tags: [],
      deletedTags: [
        {
          id: 17,
          deletedAt: ctx.values.timestamp,
          versionVector: { [ctx.values.deviceId]: 2 },
        },
      ],
      deviceProfiles: [
        {
          id: ctx.values.deviceId,
          name: "Updated device",
          createdAt: ctx.values.timestamp,
          versionVector: { [ctx.values.deviceId]: 2 },
        },
      ],
    };
    vi.mocked(ctx.ports.crypto.decryptVaultSnapshotContent).mockResolvedValue(
      remoteVault,
    );
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
        tagResolutions: [{ tagId: 17, action: "use_remote" }],
        deviceProfileResolutions: [
          { deviceId: ctx.values.deviceId, action: "use_remote" },
        ],
      },
    });
    expect(ctx.saved.unlockedVaultSession?.unlockedVault.vault).toEqual(
      remoteVault,
    );
    expect(ctx.saved.vaultSnapshot).toEqual(ctx.remoteSnapshot);
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });

  it("persists and uploads a mixed local entry and remote tag resolution", async () => {
    const ctx = createContext([localEntry]);
    const tag = {
      id: 17,
      name: "Shared",
      versionVector: { [ctx.values.deviceId]: 2 },
    };
    vi.mocked(ctx.ports.crypto.decryptVaultSnapshotContent).mockResolvedValue({
      ...ctx.remoteVault,
      tags: [tag],
    });
    await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      reviewedSnapshotIdentities: {
        local: ctx.localIdentity,
        remote: ctx.remoteIdentity,
      },
      resolution: {
        entryResolutions: [
          { entryId: singlePasswordEntry.id, action: "use_local" },
        ],
        tagResolutions: [{ tagId: 17, action: "use_remote" }],
        deviceProfileResolutions: [],
      },
    });
    expect(
      ctx.saved.unlockedVaultSession?.unlockedVault.vault.entries,
    ).toContainEqual({
      ...localEntry,
      versionVector: { [ctx.values.deviceId]: 3 },
    });
    expect(
      ctx.saved.unlockedVaultSession?.unlockedVault.vault.tags,
    ).toContainEqual({ ...tag, versionVector: { [ctx.values.deviceId]: 3 } });
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).toHaveBeenCalledOnce();
  });

  it.each(["duplicate", "extra", "missing", "unsupported"] as const)(
    "rejects %s choices before remote adoption",
    async (invalid) => {
      const ctx = createContext();
      const otherEntry = { ...singlePasswordEntry, id: "second-remote" };
      vi.mocked(ctx.ports.crypto.decryptVaultSnapshotContent).mockResolvedValue(
        { ...ctx.remoteVault, entries: [singlePasswordEntry, otherEntry] },
      );
      const resolutions: EntryReviewResolution[] = [
        { entryId: singlePasswordEntry.id, action: "use_remote" },
        {
          entryId:
            invalid === "duplicate"
              ? singlePasswordEntry.id
              : invalid === "extra"
                ? "unknown-entry"
                : otherEntry.id,
          action:
            invalid === "unsupported"
              ? ("unknown" as EntryReviewResolution["action"])
              : "use_remote",
        },
      ];
      if (invalid === "missing") resolutions.pop();
      await expect(
        ctx.useCase.execute({
          vaultId: ctx.values.vaultId,
          reviewedSnapshotIdentities: {
            local: ctx.localIdentity,
            remote: ctx.remoteIdentity,
          },
          resolution: {
            entryResolutions: resolutions,
            tagResolutions: [],
            deviceProfileResolutions: [],
          },
        }),
      ).rejects.toBeInstanceOf(
        invalid === "missing"
          ? SyncResolutionIncompleteError
          : InvalidSyncResolutionError,
      );
      expect(
        ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
      ).not.toHaveBeenCalled();
      expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
    },
  );

  it("clears a discarded pending upload atomically with remote adoption", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.crypto.decryptDeviceSyncCredentialState,
    ).mockResolvedValue({
      currentCredentials: ctx.values.syncCredentials,
      pendingSnapshotUpload: {
        candidateSnapshotIdentity: ctx.localIdentity,
        expectedRemoteSnapshotIdentity: null,
      },
    });
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
      ctx.ports.crypto.encryptDeviceSyncCredentialState,
    ).toHaveBeenCalledWith(
      { currentCredentials: ctx.values.syncCredentials },
      expect.anything(),
      expect.anything(),
    );
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: ctx.remoteSnapshot,
        expectedSyncCredentialState:
          ctx.values.encryptedDeviceSyncCredentialState,
        syncCredentialState: expect.anything(),
      }),
    );
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });
});
