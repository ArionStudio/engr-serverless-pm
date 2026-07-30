import { describe, expect, it, vi } from "vitest";
import { createUnlockVaultTestContext } from "../../__tests__/fixtures/unlock-vault";
import { createUnlockedVaultWithEntries } from "../../__tests__/fixtures/vault-entries";
import { toVaultSnapshotDescriptor } from "../../domain/snapshot";
import { InvalidDeviceRevocationTransitionError } from "../../errors/device-revocation.errors";
import {
  PreviousSyncCredentialStillActiveError,
  RemoteVaultSnapshotChangedError,
} from "../../errors/sync.errors";
import { LocalVaultSnapshotChangedError } from "../../errors/vault-snapshot.errors";
import { VaultSnapshotService } from "../../services/snapshot/vault-snapshot.service";
import { VaultSyncGuardService } from "../../services/sync";
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
  ctx.saved.localVaultTrustCheckpoint = {
    ...ctx.values.localVaultTrustCheckpoint,
    payload: {
      ...ctx.values.localVaultTrustCheckpoint.payload,
      vaultKeyGeneration: 2,
    },
  };
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
        providerCredentialRevocationPending: {
          revokedDeviceIds: [ctx.values.pendingDeviceId],
          vaultKeyGeneration: 2,
        },
      },
    },
    sourceSnapshotVersionVector: snapshot.metadata.snapshotVersionVector,
  };
  const snapshotService = new VaultSnapshotService(
    ctx.ports.crypto,
    ctx.ports.clock,
    ctx.ports.vaultLocalRepository,
  );
  const syncGuard = new VaultSyncGuardService(
    ctx.ports.syncProvider,
    snapshotService,
    ctx.ports.sessionServices.unlockedVaultSession,
    ctx.ports.crypto,
    ctx.ports.vaultLocalRepository,
  );
  vi.mocked(
    ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
  ).mockResolvedValue(toVaultSnapshotDescriptor(ctx.values.vaultId, snapshot));
  const useCase = new CompleteProviderCredentialRevocationUseCase(
    ctx.ports.crypto,
    ctx.ports.syncProvider,
    ctx.ports.sessionServices.unlockedVaultSession,
    snapshotService,
    ctx.ports.vaultLocalRepository,
    syncGuard,
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
    expect(
      ctx.ports.vaultLocalRepository.saveDeviceSyncCredentialState,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedSnapshotDigest: ctx.values.vaultSnapshotDigest,
        syncCredentialState: ctx.values.encryptedDeviceSyncCredentialState,
      }),
    );
    expect(
      ctx.saved.unlockedVaultSession?.unlockedVault.vault
        .providerCredentialRevocationPending,
    ).toBeUndefined();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).toHaveBeenCalled();
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
    const session = ctx.saved.unlockedVaultSession;

    if (session === undefined) {
      throw new Error("Expected an unlocked test session.");
    }

    const {
      providerCredentialRevocationPending,
      ...vaultWithoutProviderCredentialRevocation
    } = session.unlockedVault.vault;
    void providerCredentialRevocationPending;
    ctx.saved.unlockedVaultSession = {
      ...session,
      unlockedVault: {
        ...session.unlockedVault,
        vault: vaultWithoutProviderCredentialRevocation,
      },
    };

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).resolves.toEqual({ providerCredentialRevocation: "complete" });

    expect(ctx.ports.syncProvider.checkVaultAccess).not.toHaveBeenCalled();
  });

  it("does not report completion on a device that lacks the pending old credential", async () => {
    const ctx = createContext();
    ctx.saved.deviceSyncCredentialState =
      ctx.values.encryptedDeviceSyncCredentialState;

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).resolves.toEqual({
      providerCredentialRevocation: "pending_external_disable",
    });

    expect(ctx.ports.syncProvider.checkVaultAccess).not.toHaveBeenCalled();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });

  it("removes an older local credential without clearing another rotation marker", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.crypto.decryptDeviceSyncCredentialState,
    ).mockResolvedValueOnce({
      currentCredentials: ctx.values.replacementSyncCredentials,
      previousCredentials: {
        credentials: ctx.values.syncCredentials,
        revokedDeviceIds: ["older-revoked-device"],
        vaultKeyGeneration: 2,
      },
    });

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).resolves.toEqual({
      providerCredentialRevocation: "pending_external_disable",
    });

    expect(ctx.saved.deviceSyncCredentialState).toBe(
      ctx.values.encryptedDeviceSyncCredentialState,
    );
    expect(
      ctx.saved.unlockedVaultSession?.unlockedVault.vault
        .providerCredentialRevocationPending,
    ).toEqual({
      revokedDeviceIds: [ctx.values.pendingDeviceId],
      vaultKeyGeneration: 2,
    });
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });

  it("restores the marker and old credential when completion upload fails", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.syncProvider.uploadVaultSnapshot).mockRejectedValue(
      new Error("upload failed"),
    );

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toThrow("upload failed");

    expect(ctx.saved.deviceSyncCredentialState).toBe(
      ctx.values.replacementEncryptedDeviceSyncCredentialState,
    );
    expect(
      ctx.saved.unlockedVaultSession?.unlockedVault.vault
        .providerCredentialRevocationPending,
    ).toEqual({
      revokedDeviceIds: [ctx.values.pendingDeviceId],
      vaultKeyGeneration: 2,
    });
  });

  it("retains the old credential when the remote vault has advanced", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.syncProvider.getLatestVaultSnapshotDescriptor,
    ).mockResolvedValue({
      ...toVaultSnapshotDescriptor(
        ctx.values.vaultId,
        ctx.saved.vaultSnapshot ?? ctx.vaultSnapshot,
      ),
      snapshotVersionVector: { [ctx.values.deviceId]: 3 },
      revisionTimestamp: ctx.values.timestamp + 1,
    });

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(RemoteVaultSnapshotChangedError);

    expect(ctx.saved.deviceSyncCredentialState).toBe(
      ctx.values.replacementEncryptedDeviceSyncCredentialState,
    );
    expect(
      ctx.saved.unlockedVaultSession?.unlockedVault.vault
        .providerCredentialRevocationPending,
    ).toEqual({
      revokedDeviceIds: [ctx.values.pendingDeviceId],
      vaultKeyGeneration: 2,
    });
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });

  it("rejects pending credentials bound to another vault-key generation", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.crypto.decryptDeviceSyncCredentialState,
    ).mockResolvedValueOnce({
      currentCredentials: ctx.values.replacementSyncCredentials,
      previousCredentials: {
        credentials: ctx.values.syncCredentials,
        revokedDeviceIds: [ctx.values.pendingDeviceId],
        vaultKeyGeneration: 1,
      },
    });

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(InvalidDeviceRevocationTransitionError);

    expect(ctx.ports.syncProvider.checkVaultAccess).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshotWithCheckpoint,
    ).not.toHaveBeenCalled();
  });

  it("does not overwrite credentials when the snapshot changes during provider verification", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.syncProvider.checkVaultAccess).mockImplementationOnce(
      async () => {
        ctx.saved.vaultSnapshotDigest = "newer-snapshot-digest";
        return "authentication_rejected";
      },
    );

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(LocalVaultSnapshotChangedError);

    expect(ctx.saved.deviceSyncCredentialState).toBe(
      ctx.values.replacementEncryptedDeviceSyncCredentialState,
    );
  });
});
