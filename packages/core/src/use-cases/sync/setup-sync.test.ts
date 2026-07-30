import { describe, expect, it, vi } from "vitest";
import { createUnlockVaultTestContext } from "../../__tests__/fixtures/unlock-vault";
import { createUnlockedVaultWithEntries } from "../../__tests__/fixtures/vault-entries";
import {
  InvalidSyncConfigError,
  RemoteVaultSnapshotAheadError,
} from "../../errors/sync.errors";
import { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import { VaultSyncGuardService } from "../../services/sync";
import { SetupSyncUseCase } from "./setup-sync";

function createContext() {
  const ctx = createUnlockVaultTestContext();
  ctx.saved.deviceSyncCredentialState = undefined;
  ctx.saved.unlockedVaultSession = {
    sessionId: ctx.values.sessionId,
    unlockedVault: createUnlockedVaultWithEntries(ctx.values, []),
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
  const useCase = new SetupSyncUseCase(
    ctx.ports.syncProvider,
    ctx.ports.sessionServices.unlockedVaultSession,
    guard,
    snapshotService,
    ctx.ports.crypto,
  );

  return { ...ctx, useCase };
}

describe("SetupSyncUseCase", () => {
  it("stores only the target in the vault and encrypts credentials locally", async () => {
    const ctx = createContext();

    await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      syncConfig: ctx.values.syncConfigInput,
    });

    expect(
      ctx.saved.unlockedVaultSession?.unlockedVault.vault.syncTarget,
    ).toEqual(ctx.values.syncTarget);
    expect(ctx.saved.deviceSyncCredentialState).toBe(
      ctx.values.encryptedDeviceSyncCredentialState,
    );
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).toHaveBeenCalledWith(
      ctx.values.syncAccess,
      expect.anything(),
      null,
    );
  });

  it("does not mutate state when provider setup rejects input", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.syncProvider.setup).mockRejectedValue(
      new Error("invalid"),
    );

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        syncConfig: ctx.values.syncConfigInput,
      }),
    ).rejects.toBeInstanceOf(InvalidSyncConfigError);

    expect(ctx.saved.deviceSyncCredentialState).toBeUndefined();
  });

  it("rejects a namespace that already contains a vault snapshot", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValue({
      vaultId: ctx.values.vaultId,
      snapshotVersionVector: { [ctx.values.deviceId]: 1 },
      revisionTimestamp: ctx.values.timestamp,
    });

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        syncConfig: ctx.values.syncConfigInput,
      }),
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotAheadError);

    expect(ctx.saved.deviceSyncCredentialState).toBeUndefined();
  });

  it("restores the target and credentials together when initial upload fails", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.syncProvider.uploadVaultSnapshot).mockRejectedValue(
      new Error("upload failed"),
    );

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        syncConfig: ctx.values.syncConfigInput,
      }),
    ).rejects.toThrow("upload failed");

    expect(ctx.saved.deviceSyncCredentialState).toBeUndefined();
    expect(ctx.saved.vaultSnapshot).toEqual(ctx.vaultSnapshot);
    expect(
      ctx.saved.unlockedVaultSession?.unlockedVault.vault.syncTarget,
    ).toBeUndefined();
  });
});
