import { describe, expect, it, vi } from "vitest";
import { createUnlockVaultTestContext } from "../../__tests__/fixtures/unlock-vault";
import { createUnlockedVaultWithEntries } from "../../__tests__/fixtures/vault-entries";
import { PreviousSyncCredentialStillActiveError } from "../../errors/sync.errors";
import { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import { CompleteProviderCredentialRevocationUseCase } from "./complete-provider-credential-revocation";

function createContext() {
  const ctx = createUnlockVaultTestContext();
  const snapshot = {
    ...ctx.vaultSnapshot,
    metadata: {
      ...ctx.vaultSnapshot.metadata,
      vaultKeyGeneration: 2,
    },
    keySlots: {
      deviceSlots: [
        {
          ...ctx.vaultSnapshot.keySlots.deviceSlots[0],
          vaultKeyGeneration: 2,
          envelope: {
            ...ctx.values.vaultKeyEnvelope,
            vaultKeyGeneration: 2,
          },
        },
      ],
    },
  };
  const unlockedVault = createUnlockedVaultWithEntries(ctx.values, []);
  ctx.saved.vaultSnapshot = snapshot;
  ctx.saved.deviceSyncCredentialState =
    ctx.values.replacementEncryptedDeviceSyncCredentialState;
  ctx.saved.unlockedVaultSession = {
    sessionId: ctx.values.sessionId,
    unlockedVault: {
      ...unlockedVault,
      trustedSnapshotContext: {
        ...unlockedVault.trustedSnapshotContext,
        trust: {
          ...unlockedVault.trustedSnapshotContext.trust,
          vaultKeyGeneration: 2,
        },
      },
      vault: {
        ...unlockedVault.vault,
        syncTarget: ctx.values.syncTarget,
      },
    },
    sourceSnapshotVersionVector: snapshot.metadata.snapshotVersionVector,
  };
  const snapshotService = new VaultSnapshotService(
    ctx.ports.crypto,
    ctx.ports.clock,
    ctx.ports.vaultLocalRepository,
  );
  const useCase = new CompleteProviderCredentialRevocationUseCase(
    ctx.ports.crypto,
    ctx.ports.syncProvider,
    ctx.ports.sessionServices.unlockedVaultSession,
    snapshotService,
    ctx.ports.vaultLocalRepository,
  );

  return { ...ctx, useCase };
}

describe("CompleteProviderCredentialRevocationUseCase", () => {
  it("removes previous credentials only after provider authentication rejects them", async () => {
    const ctx = createContext();

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).resolves.toEqual({ providerCredentialRevocation: "complete" });

    expect(ctx.ports.syncProvider.checkVaultAccess).toHaveBeenCalledWith(
      {
        target: ctx.values.syncTarget,
        credentials: ctx.values.syncCredentials,
      },
      ctx.values.vaultId,
    );
    expect(ctx.saved.deviceSyncCredentialState).toBe(
      ctx.values.encryptedDeviceSyncCredentialState,
    );
  });

  it("keeps pending state while the old credential remains accessible", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.syncProvider.checkVaultAccess).mockResolvedValue(
      "accessible",
    );

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(PreviousSyncCredentialStillActiveError);

    expect(ctx.saved.deviceSyncCredentialState).toBe(
      ctx.values.replacementEncryptedDeviceSyncCredentialState,
    );
  });

  it("is idempotent after previous credentials were removed", async () => {
    const ctx = createContext();
    ctx.saved.deviceSyncCredentialState =
      ctx.values.encryptedDeviceSyncCredentialState;

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).resolves.toEqual({ providerCredentialRevocation: "complete" });

    expect(ctx.ports.syncProvider.checkVaultAccess).not.toHaveBeenCalled();
  });
});
