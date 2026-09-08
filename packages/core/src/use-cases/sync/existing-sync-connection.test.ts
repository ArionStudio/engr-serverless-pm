import { describe, expect, it, vi } from "vitest";
import { createUnlockVaultTestContext } from "../../__tests__/fixtures/unlock-vault";
import { createUnlockedVaultWithEntries } from "../../__tests__/fixtures/vault-entries";
import type { VaultSnapshot } from "../../domain/snapshot";
import { toVaultSnapshotDescriptor } from "../../domain/snapshot";
import type { Vault } from "../../domain/vault";
import {
  LocalVaultSnapshotAheadError,
  RemoteVaultSnapshotChangedError,
  RemoteVaultSnapshotIntegrityError,
} from "../../errors/sync.errors";
import { VaultTrustStateInvalidError } from "../../errors/vault-trust.errors";
import { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import {
  ConnectExistingSyncUseCase,
  PrepareExistingSyncConnectionUseCase,
} from "./existing-sync-connection";

function createContext() {
  const ctx = createUnlockVaultTestContext();
  const unlockedVault = createUnlockedVaultWithEntries(ctx.values, []);
  ctx.saved.deviceSyncCredentialState = undefined;
  ctx.saved.unlockedVaultSession = {
    sessionId: ctx.values.sessionId,
    unlockedVault,
    sourceSnapshotVersionVector:
      ctx.vaultSnapshot.metadata.snapshotVersionVector,
  };
  let remoteSnapshot: VaultSnapshot = {
    ...ctx.vaultSnapshot,
    metadata: {
      ...ctx.vaultSnapshot.metadata,
      revisionTimestamp: ctx.values.timestamp + 1,
      snapshotVersionVector: { [ctx.values.deviceId]: 2 },
    },
  };
  let remoteVault: Vault = {
    ...unlockedVault.vault,
    versionVector: { [ctx.values.deviceId]: 2 },
    syncTarget: ctx.values.syncTarget,
  };
  vi.mocked(
    ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
  ).mockImplementation(async () =>
    toVaultSnapshotDescriptor(ctx.values.vaultId, remoteSnapshot),
  );
  vi.mocked(ctx.ports.syncProvider.downloadVaultSnapshot).mockImplementation(
    async () => remoteSnapshot,
  );
  vi.mocked(ctx.ports.crypto.decryptVaultSnapshotContent).mockImplementation(
    async () => remoteVault,
  );
  const vaultSnapshot = new VaultSnapshotService(
    ctx.ports.crypto,
    ctx.ports.clock,
    ctx.ports.vaultLocalRepository,
  );
  const prepare = new PrepareExistingSyncConnectionUseCase(
    ctx.ports.syncProvider,
    ctx.ports.sessionServices.unlockedVaultSession,
    vaultSnapshot,
    ctx.ports.vaultLocalRepository,
  );
  const connect = new ConnectExistingSyncUseCase(
    ctx.ports.crypto,
    ctx.ports.syncProvider,
    ctx.ports.sessionServices.unlockedVaultSession,
    vaultSnapshot,
    ctx.ports.vaultLocalRepository,
  );

  return {
    ...ctx,
    prepare,
    connect,
    get remoteSnapshot() {
      return remoteSnapshot;
    },
    setRemoteSnapshot(snapshot: VaultSnapshot) {
      remoteSnapshot = snapshot;
    },
    setRemoteVault(vault: Vault) {
      remoteVault = vault;
    },
  };
}

describe("existing sync connection", () => {
  it.each([
    [1, 1],
    [1, 3],
    [2, 1],
    [2, 3],
  ])(
    "reconnects local snapshot %s and remote content %s with independent counters",
    async (localSnapshotRevision, contentRevision) => {
      const ctx = createContext();
      const localVector = { [ctx.values.deviceId]: localSnapshotRevision };
      ctx.saved.vaultSnapshot = {
        ...ctx.vaultSnapshot,
        metadata: {
          ...ctx.vaultSnapshot.metadata,
          snapshotVersionVector: localVector,
        },
      };
      ctx.saved.unlockedVaultSession = {
        ...ctx.saved.unlockedVaultSession!,
        sourceSnapshotVersionVector: localVector,
      };
      ctx.saved.localVaultTrustCheckpoint = {
        ...ctx.values.localVaultTrustCheckpoint,
        payload: {
          ...ctx.values.localVaultTrustCheckpoint.payload,
          snapshotVersionVector: localVector,
        },
      };
      ctx.setRemoteSnapshot({
        ...ctx.remoteSnapshot,
        metadata: {
          ...ctx.remoteSnapshot.metadata,
          snapshotVersionVector: { [ctx.values.deviceId]: 3 },
        },
      });
      ctx.setRemoteVault({
        ...ctx.values.decryptedVault,
        versionVector: { [ctx.values.deviceId]: contentRevision },
        syncTarget: ctx.values.syncTarget,
      });
      const review = await ctx.prepare.execute({
        vaultId: ctx.values.vaultId,
        syncConfig: ctx.values.syncConfigInput,
      });

      const result = await ctx.connect.execute({
        vaultId: ctx.values.vaultId,
        syncConfig: ctx.values.syncConfigInput,
        reviewedSnapshotIdentities: review.reviewedSnapshotIdentities,
      });

      expect(result.snapshotVersionVector).toEqual({
        [ctx.values.deviceId]: 3,
      });
      expect(ctx.saved.vaultSnapshot).toBe(ctx.remoteSnapshot);
      expect(
        ctx.saved.unlockedVaultSession?.unlockedVault.vault.versionVector,
      ).toEqual({ [ctx.values.deviceId]: contentRevision });
      expect(ctx.saved.deviceSyncCredentialState).toEqual(
        ctx.values.encryptedDeviceSyncCredentialState,
      );
      expect(
        ctx.saved.unlockedVaultSession?.unlockedVault.vault.syncTarget,
      ).toEqual(ctx.values.syncTarget);
      expect(
        ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          snapshot: ctx.remoteSnapshot,
          expectedSyncCredentialState: null,
          syncCredentialState: ctx.values.encryptedDeviceSyncCredentialState,
        }),
      );
      expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
    },
  );

  it("rejects a remote snapshot that changed after review without local writes", async () => {
    const ctx = createContext();
    const review = await ctx.prepare.execute({
      vaultId: ctx.values.vaultId,
      syncConfig: ctx.values.syncConfigInput,
    });
    ctx.setRemoteSnapshot({
      ...ctx.remoteSnapshot,
      metadata: {
        ...ctx.remoteSnapshot.metadata,
        revisionTimestamp: ctx.values.timestamp + 2,
        snapshotVersionVector: { [ctx.values.deviceId]: 3 },
      },
    });
    ctx.setRemoteVault({
      ...ctx.values.decryptedVault,
      versionVector: { [ctx.values.deviceId]: 3 },
      syncTarget: ctx.values.syncTarget,
    });

    await expect(
      ctx.connect.execute({
        vaultId: ctx.values.vaultId,
        syncConfig: ctx.values.syncConfigInput,
        reviewedSnapshotIdentities: review.reviewedSnapshotIdentities,
      }),
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotChangedError);
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).not.toHaveBeenCalled();
  });

  it("rejects changed vault creation time during preparation and confirmation without writes", async () => {
    const ctx = createContext();
    const params = {
      vaultId: ctx.values.vaultId,
      syncConfig: ctx.values.syncConfigInput,
    };
    const review = await ctx.prepare.execute(params);
    ctx.setRemoteSnapshot({
      ...ctx.remoteSnapshot,
      metadata: {
        ...ctx.remoteSnapshot.metadata,
        vaultCreationTimestamp:
          ctx.remoteSnapshot.metadata.vaultCreationTimestamp + 1,
      },
    });

    await expect(ctx.prepare.execute(params)).rejects.toBeInstanceOf(
      RemoteVaultSnapshotIntegrityError,
    );
    await expect(
      ctx.connect.execute({
        ...params,
        reviewedSnapshotIdentities: review.reviewedSnapshotIdentities,
      }),
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotIntegrityError);
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });

  it("rejects unsafe snapshot relations without local writes", async () => {
    const cases = [
      [{ "device-id": 1 }, RemoteVaultSnapshotIntegrityError],
      [{}, LocalVaultSnapshotAheadError],
      [
        { "device-id": 0, "other-device": 1 },
        RemoteVaultSnapshotIntegrityError,
      ],
    ] as const;

    for (const [snapshotVersionVector, errorType] of cases) {
      const ctx = createContext();
      ctx.setRemoteSnapshot({
        ...ctx.remoteSnapshot,
        metadata: {
          ...ctx.remoteSnapshot.metadata,
          snapshotVersionVector,
        },
      });

      await expect(
        ctx.prepare.execute({
          vaultId: ctx.values.vaultId,
          syncConfig: ctx.values.syncConfigInput,
        }),
      ).rejects.toBeInstanceOf(errorType);
      expect(
        ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
      ).not.toHaveBeenCalled();
    }
  });

  it("rejects changed key slots without local writes", async () => {
    const ctx = createContext();
    ctx.setRemoteSnapshot({
      ...ctx.remoteSnapshot,
      keySlots: { deviceSlots: [] },
    });

    await expect(
      ctx.prepare.execute({
        vaultId: ctx.values.vaultId,
        syncConfig: ctx.values.syncConfigInput,
      }),
    ).rejects.toBeInstanceOf(VaultTrustStateInvalidError);
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).not.toHaveBeenCalled();
  });

  it("rejects a remote vault for another target without local writes", async () => {
    const ctx = createContext();
    ctx.setRemoteVault({
      ...ctx.values.decryptedVault,
      versionVector: { [ctx.values.deviceId]: 2 },
      syncTarget: {
        ...ctx.values.syncTarget,
        targetConfig: { bucket: "another-bucket" },
      },
    });

    await expect(
      ctx.prepare.execute({
        vaultId: ctx.values.vaultId,
        syncConfig: ctx.values.syncConfigInput,
      }),
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotIntegrityError);
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).not.toHaveBeenCalled();
  });
});
