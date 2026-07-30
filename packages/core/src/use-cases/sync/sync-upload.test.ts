import { describe, expect, it, vi } from "vitest";
import { createUnlockVaultTestContext } from "../../__tests__/fixtures/unlock-vault";
import { createUnlockedVaultWithEntries } from "../../__tests__/fixtures/vault-entries";
import { toVaultSnapshotDescriptor } from "../../domain/snapshot";
import {
  LocalSyncCredentialsMissingError,
  RemoteVaultSnapshotAheadError,
} from "../../errors/sync.errors";
import { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import { VaultSyncGuardService } from "../../services/sync";
import { SyncUploadUseCase } from "./sync-upload";

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

  return { ...ctx, useCase };
}

describe("SyncUploadUseCase", () => {
  it("uploads using local encrypted credentials", async () => {
    const ctx = createContext();

    await ctx.useCase.execute({ vaultId: ctx.values.vaultId });

    expect(ctx.ports.syncProvider.uploadVaultSnapshot).toHaveBeenCalledWith(
      ctx.values.syncAccess,
      ctx.vaultSnapshot,
      null,
    );
  });

  it("does not upload an exactly equal remote descriptor", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValue(
      toVaultSnapshotDescriptor(ctx.values.vaultId, ctx.vaultSnapshot),
    );

    await ctx.useCase.execute({ vaultId: ctx.values.vaultId });

    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });

  it("blocks upload when remote is ahead", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValue({
      vaultId: ctx.values.vaultId,
      snapshotVersionVector: { [ctx.values.deviceId]: 2 },
      revisionTimestamp: ctx.values.timestamp + 1,
    });

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotAheadError);
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
});
