import { describe, expect, it, vi } from "vitest";
import { createUnlockVaultTestContext } from "../../__tests__/fixtures/unlock-vault";
import { createUnlockedVaultWithEntries } from "../../__tests__/fixtures/vault-entries";
import { toVaultSnapshotDescriptor } from "../../domain/snapshot";
import { VaultTrustStateInvalidError } from "../../errors/vault-trust.errors";
import {
  InvalidVaultSyncReviewError,
  RemoteVaultSnapshotIntegrityError,
  SyncTrustChangeRequiresDeviceTrustFlowError,
} from "../../errors/sync.errors";
import { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import { VaultSyncGuardService } from "../../services/sync";
import { PrepareSyncReviewUseCase } from "./prepare-sync-review";

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
  const remoteSnapshot = {
    ...ctx.vaultSnapshot,
    metadata: {
      ...ctx.vaultSnapshot.metadata,
      revisionTimestamp: ctx.values.timestamp + 1,
      snapshotVersionVector: { [ctx.values.deviceId]: 2 },
    },
  };
  vi.mocked(
    ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
  ).mockResolvedValue(
    toVaultSnapshotDescriptor(ctx.values.vaultId, remoteSnapshot),
  );
  vi.mocked(ctx.ports.syncProvider.downloadVaultSnapshot).mockResolvedValue(
    remoteSnapshot,
  );
  vi.mocked(ctx.ports.crypto.decryptVaultSnapshotContent).mockResolvedValue({
    ...unlockedVault.vault,
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
  const useCase = new PrepareSyncReviewUseCase(
    ctx.ports.sessionServices.unlockedVaultSession,
    ctx.ports.syncProvider,
    snapshotService,
    guard,
  );

  return { ...ctx, remoteSnapshot, useCase };
}

describe("PrepareSyncReviewUseCase", () => {
  it("returns an ordinary remote-ahead content review", async () => {
    const ctx = createContext();

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).resolves.toMatchObject({
      relation: "remote_ahead",
      review: {
        actionable: {
          entryReviews: [],
          tagReviews: [],
          deviceProfileReviews: [],
        },
        readOnly: {
          providerCredentialRevocationCompleted: false,
        },
      },
    });
  });

  it("rejects a key-generation rotation that is not signed into trust", async () => {
    const ctx = createContext();
    const rotatedSnapshot = {
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
    };
    vi.mocked(ctx.ports.syncProvider.downloadVaultSnapshot).mockResolvedValue(
      rotatedSnapshot,
    );

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(VaultTrustStateInvalidError);

    expect(ctx.ports.crypto.decryptVaultSnapshotContent).not.toHaveBeenCalled();
  });

  it("routes a valid enrollment transition to the dedicated trust flow", async () => {
    const ctx = createContext();
    const remoteSnapshot = {
      ...ctx.remoteSnapshot,
      trustChain: {
        certificates: [
          ...ctx.remoteSnapshot.trustChain.certificates,
          {
            payload: {
              version: 1 as const,
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
    };
    vi.mocked(ctx.ports.syncProvider.downloadVaultSnapshot).mockResolvedValue(
      remoteSnapshot,
    );

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(SyncTrustChangeRequiresDeviceTrustFlowError);

    expect(ctx.ports.crypto.decryptVaultSnapshotContent).not.toHaveBeenCalled();
  });

  it("skips download for exactly equal descriptors", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValue(
      toVaultSnapshotDescriptor(ctx.values.vaultId, ctx.vaultSnapshot),
    );

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).resolves.toMatchObject({ relation: "equal", review: null });
    expect(ctx.ports.syncProvider.downloadVaultSnapshot).not.toHaveBeenCalled();
  });

  it("rejects a remote tombstone for a trusted device", async () => {
    const ctx = createContext();
    const session = ctx.saved.unlockedVaultSession;

    if (session === undefined) {
      throw new Error("Expected an unlocked test session.");
    }

    vi.mocked(ctx.ports.crypto.decryptVaultSnapshotContent).mockResolvedValue({
      ...session.unlockedVault.vault,
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
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(InvalidVaultSyncReviewError);
  });

  it("rejects an active profile for an untrusted device", async () => {
    const ctx = createContext();
    const session = ctx.saved.unlockedVaultSession;

    if (session === undefined) {
      throw new Error("Expected an unlocked test session.");
    }

    vi.mocked(ctx.ports.crypto.decryptVaultSnapshotContent).mockResolvedValue({
      ...session.unlockedVault.vault,
      deviceProfiles: [
        ...session.unlockedVault.vault.deviceProfiles,
        {
          id: "untrusted-device",
          name: "Untrusted",
          createdAt: ctx.values.timestamp,
          versionVector: { [ctx.values.deviceId]: 2 },
        },
      ],
    });

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(InvalidVaultSyncReviewError);
  });

  it("rejects a remote sync target change", async () => {
    const ctx = createContext();
    const session = ctx.saved.unlockedVaultSession;

    if (session === undefined) {
      throw new Error("Expected an unlocked test session.");
    }

    vi.mocked(ctx.ports.crypto.decryptVaultSnapshotContent).mockResolvedValue({
      ...session.unlockedVault.vault,
      syncTarget: {
        ...ctx.values.syncTarget,
        targetConfig: { bucket: "another-bucket" },
      },
    });

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotIntegrityError);
  });

  it("rejects a remote sync-removal state change", async () => {
    const ctx = createContext();
    const session = ctx.saved.unlockedVaultSession;

    if (session === undefined) {
      throw new Error("Expected an unlocked test session.");
    }

    vi.mocked(ctx.ports.crypto.decryptVaultSnapshotContent).mockResolvedValue({
      ...session.unlockedVault.vault,
      syncRemovalPending: {
        expectedRemoteSnapshotDescriptor: null,
        rollbackSnapshot: ctx.vaultSnapshot,
      },
    });

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotIntegrityError);
  });

  it("accepts signed completion of provider credential revocation", async () => {
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
    });

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).resolves.toMatchObject({
      relation: "remote_ahead",
      review: {
        actionable: {
          entryReviews: [],
          tagReviews: [],
          deviceProfileReviews: [],
        },
        readOnly: {
          providerCredentialRevocationCompleted: true,
        },
      },
    });
  });

  it("rejects provider credential pending state added through generic sync", async () => {
    const ctx = createContext();
    const session = ctx.saved.unlockedVaultSession;

    if (session === undefined) {
      throw new Error("Expected an unlocked test session.");
    }

    vi.mocked(ctx.ports.crypto.decryptVaultSnapshotContent).mockResolvedValue({
      ...session.unlockedVault.vault,
      providerCredentialRevocationPending: {
        revokedDeviceIds: [ctx.values.pendingDeviceId],
        vaultKeyGeneration: 1,
      },
    });

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotIntegrityError);
  });

  it("rejects duplicate remote device profiles", async () => {
    const ctx = createContext();
    const session = ctx.saved.unlockedVaultSession;

    if (session === undefined) {
      throw new Error("Expected an unlocked test session.");
    }

    const profile = {
      id: ctx.values.deviceId,
      name: "Current device",
      createdAt: ctx.values.timestamp,
      versionVector: { [ctx.values.deviceId]: 1 },
    };

    vi.mocked(ctx.ports.crypto.decryptVaultSnapshotContent).mockResolvedValue({
      ...session.unlockedVault.vault,
      deviceProfiles: [profile, { ...profile }],
    });

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(InvalidVaultSyncReviewError);
  });
});
