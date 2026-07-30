import { describe, expect, it, vi } from "vitest";
import { createUnlockVaultTestContext } from "../../__tests__/fixtures/unlock-vault";
import {
  createUnlockedVaultWithEntries,
  singlePasswordEntry,
} from "../../__tests__/fixtures/vault-entries";
import { toVaultSnapshotDescriptor } from "../../domain/snapshot";
import {
  InvalidVaultSyncReviewError,
  RemoteVaultSnapshotChangedError,
  RemoteVaultSnapshotIntegrityError,
} from "../../errors/sync.errors";
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

  return { ...ctx, remoteSnapshot, remoteDescriptor, useCase };
}

describe("ApplySyncResolutionUseCase", () => {
  it("applies ordinary content resolution with local credentials", async () => {
    const ctx = createContext();

    await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      remoteSnapshotDescriptor: ctx.remoteDescriptor,
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
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).toHaveBeenCalledWith(
      ctx.values.syncAccess,
      expect.anything(),
      ctx.remoteDescriptor,
    );
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
        remoteSnapshotDescriptor: ctx.remoteDescriptor,
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
        remoteSnapshotDescriptor: ctx.remoteDescriptor,
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
        remoteSnapshotDescriptor: ctx.remoteDescriptor,
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

    await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      remoteSnapshotDescriptor: ctx.remoteDescriptor,
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
      remoteSnapshotDescriptor: ctx.remoteDescriptor,
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
      ctx.remoteDescriptor,
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
        remoteSnapshotDescriptor: ctx.remoteDescriptor,
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
});
