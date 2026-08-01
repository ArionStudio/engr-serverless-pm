import { describe, expect, it, vi } from "vitest";
import { createUnlockVaultTestContext } from "../../__tests__/fixtures/unlock-vault";
import { createUnlockedVaultWithEntries } from "../../__tests__/fixtures/vault-entries";
import type {
  VaultTrustChain,
  VerifiedVaultTrustState,
} from "../../domain/device-trust";
import { toVaultSnapshotDescriptor } from "../../domain/snapshot";
import {
  ProviderCredentialRevocationPendingError,
  RemoteVaultSnapshotChangedError,
  RemoteVaultSnapshotAheadError,
  RemoteVaultSnapshotIntegrityError,
} from "../../errors/sync.errors";
import { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import { VaultSyncGuardService } from "../../services/sync";
import { DisableSyncUseCase } from "./disable-sync";

function createContext() {
  const ctx = createUnlockVaultTestContext();
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
    sourceSnapshotVersionVector:
      ctx.vaultSnapshot.metadata.snapshotVersionVector,
  };
  vi.mocked(
    ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
  ).mockResolvedValue(
    toVaultSnapshotDescriptor(ctx.values.vaultId, ctx.vaultSnapshot),
  );
  vi.mocked(ctx.ports.crypto.generateVaultMasterKey).mockResolvedValue(
    ctx.values.rotatedVaultMasterKey,
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
  const useCase = new DisableSyncUseCase(
    ctx.ports.clock,
    ctx.ports.crypto,
    ctx.ports.syncProvider,
    ctx.ports.sessionServices.unlockedVaultSession,
    snapshotService,
    guard,
  );

  return { ...ctx, useCase };
}

describe("DisableSyncUseCase", () => {
  it("removes remote state, local target, and local credentials", async () => {
    const ctx = createContext();
    const expectedRemoteSnapshotDescriptor = toVaultSnapshotDescriptor(
      ctx.values.vaultId,
      ctx.vaultSnapshot,
    );

    await ctx.useCase.execute({ vaultId: ctx.values.vaultId });

    expect(ctx.ports.syncProvider.removeVaultSnapshots).toHaveBeenCalledWith(
      ctx.values.syncAccess,
      ctx.values.vaultId,
      expectedRemoteSnapshotDescriptor,
    );
    expect(
      ctx.saved.unlockedVaultSession?.unlockedVault.vault.syncTarget,
    ).toBeUndefined();
    expect(ctx.saved.deviceSyncCredentialState).toBeUndefined();
    expect(ctx.ports.crypto.generateVaultMasterKey).not.toHaveBeenCalled();
    expect(ctx.saved.vaultSnapshot?.metadata.vaultKeyGeneration).toBe(1);
    expect(
      ctx.ports.crypto.createDeviceVaultKeyEnvelope,
    ).not.toHaveBeenCalled();
    expect(ctx.saved.unlockedVaultSession?.unlockedVault.vaultMasterKey).toBe(
      ctx.values.vaultMasterKey,
    );
  });

  it("restores the exact pre-disable snapshot when the remote generation changed", async () => {
    const ctx = createContext();
    const expectedRemoteSnapshotDescriptor = toVaultSnapshotDescriptor(
      ctx.values.vaultId,
      ctx.vaultSnapshot,
    );
    const remoteAheadDescriptor = {
      ...expectedRemoteSnapshotDescriptor,
      snapshotVersionVector: { [ctx.values.deviceId]: 2 },
    };
    vi.mocked(ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor)
      .mockResolvedValueOnce(expectedRemoteSnapshotDescriptor)
      .mockResolvedValueOnce(remoteAheadDescriptor);
    vi.mocked(ctx.ports.syncProvider.removeVaultSnapshots).mockRejectedValueOnce(
      new RemoteVaultSnapshotChangedError(ctx.values.vaultId),
    );

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotChangedError);

    expect(
      ctx.saved.unlockedVaultSession?.unlockedVault.vault.syncTarget,
    ).toEqual(ctx.values.syncTarget);
    expect(
      ctx.saved.unlockedVaultSession?.unlockedVault.vault.syncRemovalPending,
    ).toBeUndefined();
    expect(ctx.saved.vaultSnapshot).toEqual(ctx.vaultSnapshot);
    expect(
      ctx.saved.unlockedVaultSession?.sourceSnapshotVersionVector,
    ).toEqual(ctx.vaultSnapshot.metadata.snapshotVersionVector);
    expect(ctx.saved.deviceSyncCredentialState).toBe(
      ctx.values.encryptedDeviceSyncCredentialState,
    );

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotAheadError);

    expect(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).toHaveBeenCalledTimes(2);
    expect(ctx.ports.syncProvider.removeVaultSnapshots).toHaveBeenCalledOnce();
  });

  it("retains pending removal when a remote failure has an unknown outcome", async () => {
    const ctx = createContext();
    const removalError = new Error("remove failed");
    const expectedRemoteSnapshotDescriptor = toVaultSnapshotDescriptor(
      ctx.values.vaultId,
      ctx.vaultSnapshot,
    );
    vi.mocked(
      ctx.ports.syncProvider.removeVaultSnapshots,
    ).mockRejectedValueOnce(removalError);

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBe(removalError);

    expect(
      ctx.saved.unlockedVaultSession?.unlockedVault.vault.syncRemovalPending,
    ).toEqual({
      expectedRemoteSnapshotDescriptor,
      rollbackSnapshot: ctx.vaultSnapshot,
    });
    expect(ctx.saved.deviceSyncCredentialState).toBe(
      ctx.values.encryptedDeviceSyncCredentialState,
    );

    await ctx.useCase.execute({ vaultId: ctx.values.vaultId });

    expect(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).toHaveBeenCalledOnce();
    expect(ctx.ports.syncProvider.removeVaultSnapshots).toHaveBeenCalledTimes(2);
    expect(
      ctx.saved.unlockedVaultSession?.unlockedVault.vault.syncTarget,
    ).toBeUndefined();
  });

  it("retains pending removal when exact snapshot restoration fails", async () => {
    const ctx = createContext();
    const restorationError = new Error("snapshot restoration failed");
    const expectedRemoteSnapshotDescriptor = toVaultSnapshotDescriptor(
      ctx.values.vaultId,
      ctx.vaultSnapshot,
    );
    const saveSnapshot = vi.mocked(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    );
    const saveSnapshotImplementation = saveSnapshot.getMockImplementation();

    if (saveSnapshotImplementation === undefined) {
      throw new Error("Expected a snapshot persistence implementation.");
    }

    saveSnapshot
      .mockImplementationOnce(saveSnapshotImplementation)
      .mockRejectedValueOnce(restorationError);
    vi.mocked(ctx.ports.syncProvider.removeVaultSnapshots)
      .mockRejectedValueOnce(new Error("remove outcome unknown"))
      .mockRejectedValueOnce(
        new RemoteVaultSnapshotChangedError(ctx.values.vaultId),
      );

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toThrow("remove outcome unknown");
    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBe(restorationError);

    expect(
      ctx.saved.unlockedVaultSession?.unlockedVault.vault.syncRemovalPending,
    ).toEqual({
      expectedRemoteSnapshotDescriptor,
      rollbackSnapshot: ctx.vaultSnapshot,
    });
    expect(ctx.saved.deviceSyncCredentialState).toBe(
      ctx.values.encryptedDeviceSyncCredentialState,
    );
  });

  it("conditions removal on remote state remaining absent after preflight", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValue(null);

    await ctx.useCase.execute({ vaultId: ctx.values.vaultId });

    expect(ctx.ports.syncProvider.removeVaultSnapshots).toHaveBeenCalledWith(
      ctx.values.syncAccess,
      ctx.values.vaultId,
      null,
    );
  });

  it("retains the pending transition when final local persistence fails", async () => {
    const ctx = createContext();
    const finalPersistError = new Error("final persistence failed");
    const expectedRemoteSnapshotDescriptor = toVaultSnapshotDescriptor(
      ctx.values.vaultId,
      ctx.vaultSnapshot,
    );
    vi.mocked(ctx.ports.crypto.encryptVaultSnapshotContent)
      .mockResolvedValueOnce(ctx.values.encryptedVault)
      .mockRejectedValueOnce(finalPersistError);

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBe(finalPersistError);

    expect(ctx.ports.syncProvider.removeVaultSnapshots).toHaveBeenCalledWith(
      ctx.values.syncAccess,
      ctx.values.vaultId,
      expectedRemoteSnapshotDescriptor,
    );
    expect(
      ctx.saved.unlockedVaultSession?.unlockedVault.vault.syncTarget,
    ).toEqual(ctx.values.syncTarget);
    expect(
      ctx.saved.unlockedVaultSession?.unlockedVault.vault.syncRemovalPending,
    ).toEqual({
      expectedRemoteSnapshotDescriptor,
      rollbackSnapshot: ctx.vaultSnapshot,
    });
    expect(ctx.saved.deviceSyncCredentialState).toBe(
      ctx.values.encryptedDeviceSyncCredentialState,
    );
  });

  it("rejects removal while old provider credentials still await disabling", async () => {
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

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(ProviderCredentialRevocationPendingError);

    expect(ctx.ports.syncProvider.removeVaultSnapshots).not.toHaveBeenCalled();
  });

  it("rejects remote state that is ahead of the local snapshot", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValue({
      ...toVaultSnapshotDescriptor(ctx.values.vaultId, ctx.vaultSnapshot),
      snapshotVersionVector: { [ctx.values.deviceId]: 2 },
    });

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotAheadError);

    expect(ctx.ports.syncProvider.removeVaultSnapshots).not.toHaveBeenCalled();
  });

  it("rejects an equal remote vector with inconsistent metadata", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValue({
      ...toVaultSnapshotDescriptor(ctx.values.vaultId, ctx.vaultSnapshot),
      revisionTimestamp: ctx.vaultSnapshot.metadata.revisionTimestamp + 1,
    });

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotIntegrityError);

    expect(ctx.ports.syncProvider.removeVaultSnapshots).not.toHaveBeenCalled();
  });

  it("resumes remote cleanup without repeating the preflight", async () => {
    const ctx = createContext();
    const session = ctx.saved.unlockedVaultSession;
    const expectedRemoteSnapshotDescriptor = toVaultSnapshotDescriptor(
      ctx.values.vaultId,
      ctx.vaultSnapshot,
    );

    if (session === undefined) {
      throw new Error("Expected an unlocked test session.");
    }

    ctx.saved.unlockedVaultSession = {
      ...session,
      unlockedVault: {
        ...session.unlockedVault,
        vault: {
          ...session.unlockedVault.vault,
          syncRemovalPending: {
            expectedRemoteSnapshotDescriptor,
            rollbackSnapshot: ctx.vaultSnapshot,
          },
        },
      },
    };

    await ctx.useCase.execute({ vaultId: ctx.values.vaultId });

    expect(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.removeVaultSnapshots).toHaveBeenCalledWith(
      ctx.values.syncAccess,
      ctx.values.vaultId,
      expectedRemoteSnapshotDescriptor,
    );
    expect(
      ctx.saved.unlockedVaultSession?.unlockedVault.vault.syncTarget,
    ).toBeUndefined();
  });

  it("rotates the vault key and rebuilds slots when disabling multi-device sync", async () => {
    const ctx = createContext();
    const session = ctx.saved.unlockedVaultSession;

    if (session === undefined) {
      throw new Error("Expected an unlocked test session.");
    }

    const otherIdentity = {
      deviceId: ctx.values.pendingDeviceId,
      publicSignKey: ctx.values.pendingDevicePublicSignKey,
      publicVaultKey: ctx.values.pendingDevicePublicVaultKey,
    };
    const trustedDevices = [
      ...session.unlockedVault.trustedSnapshotContext.trust.trustedDevices,
      otherIdentity,
    ];
    const trustChain: VaultTrustChain = {
      certificates: [
        ...ctx.vaultSnapshot.trustChain.certificates,
        {
          payload: {
            version: 1,
            vaultId: ctx.values.vaultId,
            generation: 1,
            vaultKeyGeneration: 1,
            previousCertificateDigest: ctx.values.vaultTrustCertificateDigest,
            authorizedByDeviceId: ctx.values.deviceId,
            trustedDevices,
          },
          signature: ctx.values.vaultTrustCertificateSignature,
        },
      ],
    };
    const trust: VerifiedVaultTrustState = {
      generation: 1,
      vaultKeyGeneration: 1,
      certificateDigest: ctx.values.vaultTrustCertificateDigest,
      trustedDevices,
    };
    const snapshot = {
      ...ctx.vaultSnapshot,
      trustChain,
      keySlots: {
        deviceSlots: [
          ...ctx.vaultSnapshot.keySlots.deviceSlots,
          {
            deviceId: ctx.values.pendingDeviceId,
            vaultKeyGeneration: 1,
            envelope: ctx.values.pendingDeviceVaultKeyEnvelope,
          },
        ],
      },
    };
    ctx.saved.vaultSnapshot = snapshot;
    ctx.saved.unlockedVaultSession = {
      ...session,
      unlockedVault: {
        ...session.unlockedVault,
        trustedSnapshotContext: {
          ...session.unlockedVault.trustedSnapshotContext,
          trust,
        },
      },
    };
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValue(
      toVaultSnapshotDescriptor(ctx.values.vaultId, snapshot),
    );

    await ctx.useCase.execute({ vaultId: ctx.values.vaultId });

    expect(ctx.ports.crypto.generateVaultMasterKey).toHaveBeenCalledOnce();
    expect(ctx.ports.crypto.signVaultTrustCertificate).toHaveBeenCalledOnce();
    expect(ctx.saved.vaultSnapshot?.metadata.vaultKeyGeneration).toBe(2);
    expect(ctx.saved.vaultSnapshot?.keySlots.deviceSlots).toHaveLength(1);
    expect(ctx.saved.vaultSnapshot?.keySlots.deviceSlots[0]).toMatchObject({
      deviceId: ctx.values.deviceId,
      vaultKeyGeneration: 2,
    });
    expect(ctx.ports.crypto.createDeviceVaultKeyEnvelope).toHaveBeenCalledWith(
      ctx.values.rotatedVaultMasterKey,
      ctx.values.devicePublicVaultKey,
      {
        vaultId: ctx.values.vaultId,
        deviceId: ctx.values.deviceId,
        vaultKeyGeneration: 2,
        algorithmSuiteId: "spm-v1",
      },
    );
    expect(ctx.saved.unlockedVaultSession?.unlockedVault.vaultMasterKey).toBe(
      ctx.values.rotatedVaultMasterKey,
    );
  });
});
