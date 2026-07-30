import { describe, expect, it, vi } from "vitest";
import { createUnlockVaultTestContext } from "../../__tests__/fixtures/unlock-vault";
import {
  createUnlockedVaultWithEntries,
  singlePasswordEntry,
} from "../../__tests__/fixtures/vault-entries";
import { toVaultSnapshotDescriptor } from "../../domain/snapshot";
import { RemoteVaultSnapshotChangedError } from "../../errors/sync.errors";
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
});
