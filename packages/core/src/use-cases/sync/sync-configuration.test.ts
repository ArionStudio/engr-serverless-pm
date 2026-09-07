import { describe, expect, it, vi } from "vitest";
import { createUnlockVaultTestContext } from "../../__tests__/fixtures/unlock-vault";
import { createUnlockedVaultWithEntries } from "../../__tests__/fixtures/vault-entries";
import { TestSyncAccessUseCase } from "./test-sync-access";
import { GetSyncConfigurationUseCase } from "./get-sync-configuration";
import { SyncCredentialsRejectedError } from "../../errors/sync.errors";

function context(configured = true) {
  const ctx = createUnlockVaultTestContext();
  const unlockedVault = createUnlockedVaultWithEntries(ctx.values, []);
  ctx.saved.unlockedVaultSession = {
    sessionId: ctx.values.sessionId,
    sourceSnapshotVersionVector:
      ctx.vaultSnapshot.metadata.snapshotVersionVector,
    unlockedVault: {
      ...unlockedVault,
      vault: {
        ...unlockedVault.vault,
        syncTarget: configured ? ctx.values.syncTarget : undefined,
      },
    },
  };
  vi.mocked(ctx.ports.syncProvider.setup).mockResolvedValue(
    ctx.values.replacementSyncAccess,
  );
  vi.mocked(ctx.ports.syncProvider.checkVaultAccess).mockResolvedValue(
    "accessible",
  );
  return {
    ...ctx,
    read: new GetSyncConfigurationUseCase(
      ctx.ports.sessionServices.unlockedVaultSession,
    ),
    test: new TestSyncAccessUseCase(
      ctx.ports.sessionServices.unlockedVaultSession,
      ctx.ports.syncProvider,
    ),
  };
}
describe("sync configuration reads and access tests", () => {
  it("returns detached non-secret configuration and makes no provider request", async () => {
    const ctx = context();
    const result = await ctx.read.execute({ vaultId: ctx.values.vaultId });
    expect(result).toEqual({ target: ctx.values.syncTarget });
    expect(result.target).not.toBe(ctx.values.syncTarget);
    expect(result.target?.targetConfig).not.toBe(
      ctx.values.syncTarget.targetConfig,
    );
    expect(ctx.ports.syncProvider.checkVaultAccess).not.toHaveBeenCalled();
  });
  it("reports unconfigured without exposing credential state", async () => {
    const ctx = context(false);
    await expect(
      ctx.read.execute({ vaultId: ctx.values.vaultId }),
    ).resolves.toEqual({ target: null });
  });
  it("tests access without changing local or remote state", async () => {
    const ctx = context(false);
    const before = structuredClone(ctx.saved);
    await ctx.test.execute({
      vaultId: ctx.values.vaultId,
      syncConfig: ctx.values.replacementSyncConfigInput,
    });
    expect(ctx.saved).toEqual(before);
    expect(ctx.ports.syncProvider.checkVaultAccess).toHaveBeenCalledWith(
      ctx.values.replacementSyncAccess,
      ctx.values.vaultId,
    );
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
    expect(
      ctx.ports.syncProvider.prepareVaultSnapshotUpload,
    ).not.toHaveBeenCalled();
  });
  it("rejects authentication failure instead of claiming access", async () => {
    const ctx = context();
    vi.mocked(ctx.ports.syncProvider.checkVaultAccess).mockResolvedValue(
      "authentication_rejected",
    );
    await expect(
      ctx.test.execute({
        vaultId: ctx.values.vaultId,
        syncConfig: ctx.values.replacementSyncConfigInput,
      }),
    ).rejects.toBeInstanceOf(SyncCredentialsRejectedError);
  });
  it("does not probe S3 or reveal configuration when locked", async () => {
    const ctx = context();
    ctx.saved.unlockedVaultSession = undefined;
    await expect(
      ctx.read.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toThrow();
    await expect(
      ctx.test.execute({
        vaultId: ctx.values.vaultId,
        syncConfig: ctx.values.replacementSyncConfigInput,
      }),
    ).rejects.toThrow();
    expect(ctx.ports.syncProvider.checkVaultAccess).not.toHaveBeenCalled();
  });
});
