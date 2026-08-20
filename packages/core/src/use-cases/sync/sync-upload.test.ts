import { describe, expect, it, vi } from "vitest";
import { createUnlockVaultTestContext } from "../../__tests__/fixtures/unlock-vault";
import { createUnlockedVaultWithEntries } from "../../__tests__/fixtures/vault-entries";
import { toVaultSnapshotDescriptor } from "../../domain/snapshot";
import {
  LocalSyncCredentialsMissingError,
  RemoteVaultSnapshotAheadError,
  RemoteVaultSnapshotIntegrityError,
  SyncConflictDetectedError,
  SyncProviderUploadRejectedError,
} from "../../errors/sync.errors";
import { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import { VaultSyncGuardService } from "../../services/sync";
import { SyncUploadUseCase } from "./sync-upload";

function createContext() {
  const ctx = createUnlockVaultTestContext();
  const vaultSnapshot = {
    ...ctx.vaultSnapshot,
    metadata: {
      ...ctx.vaultSnapshot.metadata,
      uploadExpectedRemoteSnapshotIdentity: null,
    },
  };
  const unlockedVault = createUnlockedVaultWithEntries(ctx.values, []);
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
    sourceSnapshotVersionVector: vaultSnapshot.metadata.snapshotVersionVector,
  };
  ctx.saved.vaultSnapshot = vaultSnapshot;
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
  const useCase = new SyncUploadUseCase(
    ctx.ports.syncProvider,
    ctx.ports.sessionServices.unlockedVaultSession,
    snapshotService,
    guard,
  );

  return { ...ctx, vaultSnapshot, useCase };
}

describe("SyncUploadUseCase", () => {
  it("uploads using local encrypted credentials", async () => {
    const ctx = createContext();

    const result = await ctx.useCase.execute({ vaultId: ctx.values.vaultId });

    expect(ctx.ports.syncProvider.uploadVaultSnapshot).toHaveBeenCalledWith(
      ctx.values.syncAccess,
      ctx.vaultSnapshot,
      null,
    );
    expect(result).toEqual({ syncUpload: "complete" });
  });

  it("does not upload an exactly equal remote descriptor", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValue(
      toVaultSnapshotDescriptor(ctx.values.vaultId, ctx.vaultSnapshot),
    );
    vi.mocked(ctx.ports.syncProvider.downloadVaultSnapshot).mockResolvedValue(
      ctx.vaultSnapshot,
    );

    const result = await ctx.useCase.execute({ vaultId: ctx.values.vaultId });

    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
    expect(result).toEqual({ syncUpload: "complete" });
  });

  it("uploads a local-ahead snapshot using the remote descriptor as the expected state", async () => {
    const ctx = createContext();
    const remoteSnapshotDescriptor = {
      vaultId: ctx.values.vaultId,
      snapshotVersionVector: {
        [ctx.values.deviceId]: 1,
      },
      revisionTimestamp: ctx.values.timestamp,
    };
    const remoteSnapshotIdentity = {
      descriptor: remoteSnapshotDescriptor,
      snapshotDigest: ctx.values.vaultSnapshotDigest,
    };
    const localSnapshot = {
      ...ctx.vaultSnapshot,
      metadata: {
        ...ctx.vaultSnapshot.metadata,
        revisionTimestamp: ctx.values.timestamp + 1,
        snapshotVersionVector: {
          [ctx.values.deviceId]: 2,
        },
        uploadExpectedRemoteSnapshotIdentity: remoteSnapshotIdentity,
      },
    };
    const session = ctx.saved.unlockedVaultSession!;
    ctx.saved.vaultSnapshot = localSnapshot;
    ctx.saved.unlockedVaultSession = {
      ...session,
      sourceSnapshotVersionVector: localSnapshot.metadata.snapshotVersionVector,
    };
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValue(remoteSnapshotDescriptor);
    vi.mocked(ctx.ports.syncProvider.downloadVaultSnapshot).mockResolvedValue(
      ctx.vaultSnapshot,
    );

    await ctx.useCase.execute({ vaultId: ctx.values.vaultId });

    expect(ctx.ports.syncProvider.uploadVaultSnapshot).toHaveBeenCalledWith(
      ctx.values.syncAccess,
      localSnapshot,
      remoteSnapshotIdentity,
    );
  });

  it("blocks upload when remote is ahead", async () => {
    const ctx = createContext();
    const remoteSnapshotDescriptor = {
      vaultId: ctx.values.vaultId,
      snapshotVersionVector: { [ctx.values.deviceId]: 2 },
      revisionTimestamp: ctx.values.timestamp + 1,
    };
    const localSnapshot = {
      ...ctx.vaultSnapshot,
      metadata: {
        ...ctx.vaultSnapshot.metadata,
        uploadExpectedRemoteSnapshotIdentity: {
          descriptor: remoteSnapshotDescriptor,
          snapshotDigest: ctx.values.vaultSnapshotDigest,
        },
      },
    };
    ctx.saved.vaultSnapshot = localSnapshot;
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValue(remoteSnapshotDescriptor);

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotAheadError);
  });

  it.each(["fresh", "pending retry"] as const)(
    "rejects a same-descriptor historical remote with different bytes during a %s upload",
    async (attemptKind) => {
      const ctx = createContext();
      const expectedRemoteSnapshotDescriptor = {
        vaultId: ctx.values.vaultId,
        snapshotVersionVector: { [ctx.values.deviceId]: 1 },
        revisionTimestamp: ctx.values.timestamp,
      };
      const expectedRemoteSnapshotIdentity = {
        descriptor: expectedRemoteSnapshotDescriptor,
        snapshotDigest: ctx.values.vaultSnapshotDigest,
      };
      const localSnapshot = {
        ...ctx.vaultSnapshot,
        metadata: {
          ...ctx.vaultSnapshot.metadata,
          revisionTimestamp: ctx.values.timestamp + 1,
          snapshotVersionVector: { [ctx.values.deviceId]: 2 },
          uploadExpectedRemoteSnapshotIdentity: expectedRemoteSnapshotIdentity,
        },
      };
      const session = ctx.saved.unlockedVaultSession!;
      ctx.saved.vaultSnapshot = localSnapshot;
      ctx.saved.unlockedVaultSession = {
        ...session,
        sourceSnapshotVersionVector:
          localSnapshot.metadata.snapshotVersionVector,
      };
      vi.mocked(
        ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
      ).mockResolvedValue(expectedRemoteSnapshotDescriptor);
      vi.mocked(ctx.ports.syncProvider.downloadVaultSnapshot).mockResolvedValue(
        ctx.vaultSnapshot,
      );

      if (attemptKind === "pending retry") {
        ctx.saved.deviceSyncCredentialState =
          await ctx.ports.crypto.encryptDeviceSyncCredentialState(
            {
              ...ctx.values.deviceSyncCredentialState,
              pendingSnapshotUpload: {
                candidateSnapshotIdentity: {
                  descriptor: toVaultSnapshotDescriptor(
                    ctx.values.vaultId,
                    localSnapshot,
                  ),
                  snapshotDigest: ctx.values.vaultSnapshotDigest,
                },
                expectedRemoteSnapshotIdentity,
              },
            },
            ctx.values.deviceLocalProtectionKey,
            {
              vaultId: ctx.values.vaultId,
              deviceId: ctx.values.deviceId,
              provider: ctx.values.syncTarget.provider,
              target: ctx.values.syncTarget,
            },
          );
      }

      const verification = vi
        .spyOn(VaultSnapshotService.prototype, "verifyHistoricalSnapshotTrust")
        .mockResolvedValue({
          chain: ctx.values.vaultTrustChain,
          state: ctx.values.verifiedVaultTrustState,
          snapshotDigest: "substituted-remote-snapshot-digest",
        });

      try {
        await expect(
          ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
        ).rejects.toBeInstanceOf(RemoteVaultSnapshotIntegrityError);
      } finally {
        verification.mockRestore();
      }

      expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
    },
  );

  it("rejects a local-ahead descriptor from another vault before upload", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValue({
      vaultId: "other-vault-id",
      snapshotVersionVector: { [ctx.values.deviceId]: 0 },
      revisionTimestamp: ctx.values.timestamp - 1,
    });

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotIntegrityError);

    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });

  it("fails closed before upload when the signed remote expectation is absent", async () => {
    const ctx = createContext();
    const snapshotWithoutExpectation = {
      ...ctx.vaultSnapshot,
      metadata: {
        id: ctx.vaultSnapshot.metadata.id,
        schemaVersion: ctx.vaultSnapshot.metadata.schemaVersion,
        vaultCreationTimestamp:
          ctx.vaultSnapshot.metadata.vaultCreationTimestamp,
        revisionTimestamp: ctx.vaultSnapshot.metadata.revisionTimestamp,
        snapshotVersionVector: ctx.vaultSnapshot.metadata.snapshotVersionVector,
        algorithmSuiteId: ctx.vaultSnapshot.metadata.algorithmSuiteId,
        createdByDeviceId: ctx.vaultSnapshot.metadata.createdByDeviceId,
        vaultKeyGeneration: ctx.vaultSnapshot.metadata.vaultKeyGeneration,
      },
    };
    ctx.saved.vaultSnapshot = snapshotWithoutExpectation;

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotIntegrityError);

    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });

  it("fails before provider access when local credentials are missing", async () => {
    const ctx = createContext();
    ctx.saved.deviceSyncCredentialState = undefined;

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(LocalSyncCredentialsMissingError);

    expect(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).not.toHaveBeenCalled();
  });

  it("reports conflict when upload is definitely not committed", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.syncProvider.uploadVaultSnapshot).mockResolvedValueOnce(
      {
        status: "definitely_not_committed",
        reason: "remote_snapshot_changed",
      },
    );

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(SyncConflictDetectedError);
    await expect(
      ctx.ports.crypto.decryptDeviceSyncCredentialState(
        ctx.saved.deviceSyncCredentialState!,
        ctx.values.deviceLocalProtectionKey,
        {
          vaultId: ctx.values.vaultId,
          deviceId: ctx.values.deviceId,
          provider: ctx.values.syncTarget.provider,
          target: ctx.values.syncTarget,
        },
      ),
    ).resolves.toEqual(ctx.values.deviceSyncCredentialState);
  });

  it("clears a freshly staged intent when the provider definitely rejects the upload", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.syncProvider.uploadVaultSnapshot).mockResolvedValueOnce(
      {
        status: "definitely_not_committed",
        reason: "provider_rejected",
      },
    );

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(SyncProviderUploadRejectedError);
    await expect(
      ctx.ports.crypto.decryptDeviceSyncCredentialState(
        ctx.saved.deviceSyncCredentialState!,
        ctx.values.deviceLocalProtectionKey,
        {
          vaultId: ctx.values.vaultId,
          deviceId: ctx.values.deviceId,
          provider: ctx.values.syncTarget.provider,
          target: ctx.values.syncTarget,
        },
      ),
    ).resolves.toEqual(ctx.values.deviceSyncCredentialState);
  });

  it("clears a freshly staged intent after a pre-write provider rejection", async () => {
    const ctx = createContext();
    const uploadError = new Error("upload validation failed");
    vi.mocked(
      ctx.ports.syncProvider.prepareVaultSnapshotUpload,
    ).mockRejectedValueOnce(uploadError);

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBe(uploadError);
    await expect(
      ctx.ports.crypto.decryptDeviceSyncCredentialState(
        ctx.saved.deviceSyncCredentialState!,
        ctx.values.deviceLocalProtectionKey,
        {
          vaultId: ctx.values.vaultId,
          deviceId: ctx.values.deviceId,
          provider: ctx.values.syncTarget.provider,
          target: ctx.values.syncTarget,
        },
      ),
    ).resolves.toEqual(ctx.values.deviceSyncCredentialState);
  });

  it("reports pending and recognizes exact equality when an unknown upload committed remotely", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.syncProvider.uploadVaultSnapshot).mockResolvedValueOnce(
      {
        status: "outcome_unknown",
      },
    );

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).resolves.toEqual({ syncUpload: "pending" });
    expect(
      ctx.ports.crypto.encryptDeviceSyncCredentialState,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingSnapshotUpload: {
          candidateSnapshotIdentity: {
            descriptor: toVaultSnapshotDescriptor(
              ctx.values.vaultId,
              ctx.vaultSnapshot,
            ),
            snapshotDigest: ctx.values.vaultSnapshotDigest,
          },
          expectedRemoteSnapshotIdentity: null,
        },
      }),
      ctx.values.deviceLocalProtectionKey,
      expect.any(Object),
    );

    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce(
      toVaultSnapshotDescriptor(ctx.values.vaultId, ctx.vaultSnapshot),
    );
    vi.mocked(ctx.ports.syncProvider.downloadVaultSnapshot).mockResolvedValue(
      ctx.vaultSnapshot,
    );

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).resolves.toEqual({ syncUpload: "complete" });
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).toHaveBeenCalledOnce();
  });

  it("does not report complete while a matching pending intent remains after a concurrent upload", async () => {
    const ctx = createContext();
    const candidateDescriptor = toVaultSnapshotDescriptor(
      ctx.values.vaultId,
      ctx.vaultSnapshot,
    );
    let resolveFirstLookup!: () => void;
    let signalFirstLookupStarted!: () => void;
    const firstLookup = new Promise<typeof candidateDescriptor>((resolve) => {
      resolveFirstLookup = () => resolve(candidateDescriptor);
    });
    const firstLookupStarted = new Promise<void>((resolve) => {
      signalFirstLookupStarted = resolve;
    });
    vi.mocked(ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor)
      .mockImplementationOnce(async () => {
        signalFirstLookupStarted();
        return firstLookup;
      })
      .mockResolvedValueOnce(null);
    vi.mocked(ctx.ports.syncProvider.uploadVaultSnapshot).mockResolvedValueOnce(
      {
        status: "outcome_unknown",
      },
    );
    vi.mocked(ctx.ports.syncProvider.downloadVaultSnapshot).mockResolvedValue(
      ctx.vaultSnapshot,
    );

    const equalityCheck = ctx.useCase.execute({ vaultId: ctx.values.vaultId });
    await firstLookupStarted;
    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).resolves.toEqual({ syncUpload: "pending" });
    resolveFirstLookup();

    await expect(equalityCheck).resolves.toEqual({ syncUpload: "complete" });
    await expect(
      ctx.ports.crypto.decryptDeviceSyncCredentialState(
        ctx.saved.deviceSyncCredentialState!,
        ctx.values.deviceLocalProtectionKey,
        {
          vaultId: ctx.values.vaultId,
          deviceId: ctx.values.deviceId,
          provider: ctx.values.syncTarget.provider,
          target: ctx.values.syncTarget,
        },
      ),
    ).resolves.toEqual(ctx.values.deviceSyncCredentialState);
  });

  it("retains pending reconciliation for a same-descriptor remote snapshot with a different digest", async () => {
    const ctx = createContext();
    const remoteSnapshot = { ...ctx.vaultSnapshot };
    vi.mocked(ctx.ports.syncProvider.uploadVaultSnapshot).mockResolvedValueOnce(
      {
        status: "outcome_unknown",
      },
    );

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).resolves.toEqual({ syncUpload: "pending" });

    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce(
      toVaultSnapshotDescriptor(ctx.values.vaultId, remoteSnapshot),
    );
    vi.mocked(ctx.ports.syncProvider.downloadVaultSnapshot).mockResolvedValue(
      remoteSnapshot,
    );
    vi.mocked(ctx.ports.crypto.digestVaultSnapshot).mockImplementation(
      async (snapshot) =>
        snapshot === remoteSnapshot
          ? "different-remote-snapshot-digest"
          : ctx.values.vaultSnapshotDigest,
    );

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotIntegrityError);
    await expect(
      ctx.ports.crypto.decryptDeviceSyncCredentialState(
        ctx.saved.deviceSyncCredentialState!,
        ctx.values.deviceLocalProtectionKey,
        {
          vaultId: ctx.values.vaultId,
          deviceId: ctx.values.deviceId,
          provider: ctx.values.syncTarget.provider,
          target: ctx.values.syncTarget,
        },
      ),
    ).resolves.toEqual(
      expect.objectContaining({ pendingSnapshotUpload: expect.any(Object) }),
    );
  });

  it("retries the same snapshot when an unknown upload definitely did not commit", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.syncProvider.uploadVaultSnapshot)
      .mockResolvedValueOnce({ status: "outcome_unknown" })
      .mockResolvedValueOnce({ status: "committed" });

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).resolves.toEqual({ syncUpload: "pending" });
    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).resolves.toEqual({ syncUpload: "complete" });

    expect(ctx.ports.syncProvider.uploadVaultSnapshot).toHaveBeenCalledTimes(2);
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).toHaveBeenNthCalledWith(
      2,
      ctx.values.syncAccess,
      ctx.vaultSnapshot,
      null,
    );
  });

  it("reports pending without rollback when clearing a committed upload intent races", async () => {
    const ctx = createContext();
    const save = vi.mocked(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    );
    const saveImplementation = save.getMockImplementation();

    if (saveImplementation === undefined) {
      throw new Error("Expected the repository save fixture implementation.");
    }

    save
      .mockImplementationOnce(saveImplementation)
      .mockRejectedValueOnce(new Error("clear raced"));

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).resolves.toEqual({ syncUpload: "pending" });

    expect(ctx.ports.syncProvider.uploadVaultSnapshot).toHaveBeenCalledOnce();
    await expect(
      ctx.ports.crypto.decryptDeviceSyncCredentialState(
        ctx.saved.deviceSyncCredentialState!,
        ctx.values.deviceLocalProtectionKey,
        {
          vaultId: ctx.values.vaultId,
          deviceId: ctx.values.deviceId,
          provider: ctx.values.syncTarget.provider,
          target: ctx.values.syncTarget,
        },
      ),
    ).resolves.toEqual(
      expect.objectContaining({ pendingSnapshotUpload: expect.any(Object) }),
    );
  });

  it("retains the original intent when a reconciliation retry is rejected before commit", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.syncProvider.uploadVaultSnapshot)
      .mockResolvedValueOnce({ status: "outcome_unknown" })
      .mockResolvedValueOnce({
        status: "definitely_not_committed",
        reason: "provider_rejected",
      });

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).resolves.toEqual({ syncUpload: "pending" });
    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(SyncProviderUploadRejectedError);

    expect(ctx.ports.syncProvider.uploadVaultSnapshot).toHaveBeenCalledTimes(2);
    await expect(
      ctx.ports.crypto.decryptDeviceSyncCredentialState(
        ctx.saved.deviceSyncCredentialState!,
        ctx.values.deviceLocalProtectionKey,
        {
          vaultId: ctx.values.vaultId,
          deviceId: ctx.values.deviceId,
          provider: ctx.values.syncTarget.provider,
          target: ctx.values.syncTarget,
        },
      ),
    ).resolves.toEqual(
      expect.objectContaining({ pendingSnapshotUpload: expect.any(Object) }),
    );
  });

  it("rejects a pending intent whose candidate digest no longer matches local state", async () => {
    const ctx = createContext();
    ctx.saved.deviceSyncCredentialState =
      await ctx.ports.crypto.encryptDeviceSyncCredentialState(
        {
          ...ctx.values.deviceSyncCredentialState,
          pendingSnapshotUpload: {
            candidateSnapshotIdentity: {
              descriptor: toVaultSnapshotDescriptor(
                ctx.values.vaultId,
                ctx.vaultSnapshot,
              ),
              snapshotDigest: "different-snapshot-digest",
            },
            expectedRemoteSnapshotIdentity: null,
          },
        },
        ctx.values.deviceLocalProtectionKey,
        {
          vaultId: ctx.values.vaultId,
          deviceId: ctx.values.deviceId,
          provider: ctx.values.syncTarget.provider,
          target: ctx.values.syncTarget,
        },
      );

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotIntegrityError);

    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });

  it("rejects a pending intent whose expected remote differs from the signed snapshot expectation", async () => {
    const ctx = createContext();
    ctx.saved.deviceSyncCredentialState =
      await ctx.ports.crypto.encryptDeviceSyncCredentialState(
        {
          ...ctx.values.deviceSyncCredentialState,
          pendingSnapshotUpload: {
            candidateSnapshotIdentity: {
              descriptor: toVaultSnapshotDescriptor(
                ctx.values.vaultId,
                ctx.vaultSnapshot,
              ),
              snapshotDigest: ctx.values.vaultSnapshotDigest,
            },
            expectedRemoteSnapshotIdentity: {
              descriptor: {
                vaultId: ctx.values.vaultId,
                snapshotVersionVector: { [ctx.values.deviceId]: 0 },
                revisionTimestamp: ctx.values.timestamp - 1,
              },
              snapshotDigest: "different-expected-remote-digest",
            },
          },
        },
        ctx.values.deviceLocalProtectionKey,
        {
          vaultId: ctx.values.vaultId,
          deviceId: ctx.values.deviceId,
          provider: ctx.values.syncTarget.provider,
          target: ctx.values.syncTarget,
        },
      );
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce(
      toVaultSnapshotDescriptor(ctx.values.vaultId, ctx.vaultSnapshot),
    );

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotIntegrityError);

    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.downloadVaultSnapshot).not.toHaveBeenCalled();
  });

  it("does not overwrite a remote change discovered after an unknown upload", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.syncProvider.uploadVaultSnapshot).mockResolvedValueOnce(
      {
        status: "outcome_unknown",
      },
    );

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).resolves.toEqual({ syncUpload: "pending" });

    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValueOnce({
      vaultId: ctx.values.vaultId,
      snapshotVersionVector: { [ctx.values.deviceId]: 2 },
      revisionTimestamp: ctx.values.timestamp + 1,
    });

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(SyncConflictDetectedError);
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).toHaveBeenCalledOnce();
  });

  it.each(["deleted", "rolled back"] as const)(
    "does not replace a %s remote snapshot after an unknown replacement upload",
    async (remoteChange) => {
      const ctx = createContext();
      const expectedRemoteSnapshotDescriptor = {
        vaultId: ctx.values.vaultId,
        snapshotVersionVector: { [ctx.values.deviceId]: 1 },
        revisionTimestamp: ctx.values.timestamp,
      };
      const expectedRemoteSnapshotIdentity = {
        descriptor: expectedRemoteSnapshotDescriptor,
        snapshotDigest: ctx.values.vaultSnapshotDigest,
      };
      const localSnapshot = {
        ...ctx.vaultSnapshot,
        metadata: {
          ...ctx.vaultSnapshot.metadata,
          revisionTimestamp: ctx.values.timestamp + 1,
          snapshotVersionVector: { [ctx.values.deviceId]: 2 },
          uploadExpectedRemoteSnapshotIdentity: expectedRemoteSnapshotIdentity,
        },
      };
      const session = ctx.saved.unlockedVaultSession!;
      ctx.saved.vaultSnapshot = localSnapshot;
      ctx.saved.unlockedVaultSession = {
        ...session,
        sourceSnapshotVersionVector:
          localSnapshot.metadata.snapshotVersionVector,
      };
      vi.mocked(ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor)
        .mockResolvedValueOnce(expectedRemoteSnapshotDescriptor)
        .mockResolvedValueOnce(
          remoteChange === "deleted"
            ? null
            : {
                vaultId: ctx.values.vaultId,
                snapshotVersionVector: { [ctx.values.deviceId]: 0 },
                revisionTimestamp: ctx.values.timestamp - 1,
              },
        );
      vi.mocked(ctx.ports.syncProvider.downloadVaultSnapshot).mockResolvedValue(
        ctx.vaultSnapshot,
      );
      vi.mocked(
        ctx.ports.syncProvider.uploadVaultSnapshot,
      ).mockResolvedValueOnce({ status: "outcome_unknown" });

      await expect(
        ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
      ).resolves.toEqual({ syncUpload: "pending" });
      await expect(
        ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
      ).rejects.toBeInstanceOf(SyncConflictDetectedError);

      expect(ctx.ports.syncProvider.uploadVaultSnapshot).toHaveBeenCalledOnce();
      expect(
        ctx.ports.crypto.encryptDeviceSyncCredentialState,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          pendingSnapshotUpload: {
            candidateSnapshotIdentity: {
              descriptor: toVaultSnapshotDescriptor(
                ctx.values.vaultId,
                localSnapshot,
              ),
              snapshotDigest: ctx.values.vaultSnapshotDigest,
            },
            expectedRemoteSnapshotIdentity,
          },
        }),
        ctx.values.deviceLocalProtectionKey,
        expect.any(Object),
      );
    },
  );

  it.each(["deleted", "rolled back"] as const)(
    "does not overwrite a %s remote after the encrypted pending intent is replayed away",
    async (remoteChange) => {
      const ctx = createContext();
      const preIntentCredentialState =
        ctx.values.encryptedDeviceSyncCredentialState;
      const expectedRemoteSnapshotDescriptor = {
        vaultId: ctx.values.vaultId,
        snapshotVersionVector: { [ctx.values.deviceId]: 1 },
        revisionTimestamp: ctx.values.timestamp,
      };
      const expectedRemoteSnapshotIdentity = {
        descriptor: expectedRemoteSnapshotDescriptor,
        snapshotDigest: ctx.values.vaultSnapshotDigest,
      };
      const localSnapshot = {
        ...ctx.vaultSnapshot,
        metadata: {
          ...ctx.vaultSnapshot.metadata,
          revisionTimestamp: ctx.values.timestamp + 1,
          snapshotVersionVector: { [ctx.values.deviceId]: 2 },
          uploadExpectedRemoteSnapshotIdentity: expectedRemoteSnapshotIdentity,
        },
      };
      const session = ctx.saved.unlockedVaultSession!;
      ctx.saved.vaultSnapshot = localSnapshot;
      ctx.saved.unlockedVaultSession = {
        ...session,
        sourceSnapshotVersionVector:
          localSnapshot.metadata.snapshotVersionVector,
      };
      vi.mocked(ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor)
        .mockResolvedValueOnce(expectedRemoteSnapshotDescriptor)
        .mockResolvedValueOnce(
          remoteChange === "deleted"
            ? null
            : {
                vaultId: ctx.values.vaultId,
                snapshotVersionVector: { [ctx.values.deviceId]: 0 },
                revisionTimestamp: ctx.values.timestamp - 1,
              },
        );
      vi.mocked(ctx.ports.syncProvider.downloadVaultSnapshot).mockResolvedValue(
        ctx.vaultSnapshot,
      );
      vi.mocked(
        ctx.ports.syncProvider.uploadVaultSnapshot,
      ).mockResolvedValueOnce({ status: "outcome_unknown" });

      await expect(
        ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
      ).resolves.toEqual({ syncUpload: "pending" });

      ctx.saved.deviceSyncCredentialState = preIntentCredentialState;

      await expect(
        ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
      ).rejects.toBeInstanceOf(SyncConflictDetectedError);

      expect(ctx.ports.syncProvider.uploadVaultSnapshot).toHaveBeenCalledOnce();
    },
  );
});
