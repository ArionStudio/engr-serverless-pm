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

    await ctx.useCase.execute({ vaultId: ctx.values.vaultId });

    expect(ctx.ports.syncProvider.removeVaultSnapshots).toHaveBeenCalledWith(
      ctx.values.syncAccess,
      ctx.values.vaultId,
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

  it("keeps the target and credentials when remote removal fails", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.syncProvider.removeVaultSnapshots).mockRejectedValue(
      new Error("remove failed"),
    );

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toThrow("remove failed");

    expect(
      ctx.saved.unlockedVaultSession?.unlockedVault.vault.syncTarget,
    ).toEqual(ctx.values.syncTarget);
    expect(ctx.saved.deviceSyncCredentialState).toBe(
      ctx.values.encryptedDeviceSyncCredentialState,
    );
  });

  it("rejects removal while old provider credentials still await disabling", async () => {
    const ctx = createContext();
    ctx.saved.deviceSyncCredentialState =
      ctx.values.replacementEncryptedDeviceSyncCredentialState;

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

    if (session === undefined) {
      throw new Error("Expected an unlocked test session.");
    }

    ctx.saved.unlockedVaultSession = {
      ...session,
      unlockedVault: {
        ...session.unlockedVault,
        vault: {
          ...session.unlockedVault.vault,
          syncRemovalPending: true,
        },
      },
    };

    await ctx.useCase.execute({ vaultId: ctx.values.vaultId });

    expect(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.removeVaultSnapshots).toHaveBeenCalledOnce();
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
