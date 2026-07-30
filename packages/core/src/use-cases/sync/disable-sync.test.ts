import { describe, expect, it, vi } from "vitest";
import { createUnlockVaultTestContext } from "../../__tests__/fixtures/unlock-vault";
import { createUnlockedVaultWithEntries } from "../../__tests__/fixtures/vault-entries";
import { toVaultSnapshotDescriptor } from "../../domain/snapshot";
import { ProviderCredentialRevocationPendingError } from "../../errors/sync.errors";
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
});
