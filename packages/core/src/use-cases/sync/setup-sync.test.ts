import { describe, expect, it, vi } from "vitest";
import { createUnlockVaultTestContext } from "../../__tests__/fixtures/unlock-vault";
import { captureVaultSnapshotFromNextSave } from "../../__tests__/fixtures/ports";
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
  it("uploads the exact signed initial-sync snapshot persisted by the local save", async () => {
    const ctx = createContext();
    const getPersistedSnapshot = captureVaultSnapshotFromNextSave(ctx.ports);

    const result = await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      syncConfig: ctx.values.syncConfigInput,
    });

    const uploadedSnapshot = vi.mocked(
      ctx.ports.syncProvider.uploadVaultSnapshot,
    ).mock.calls[0]?.[1];
    expect(uploadedSnapshot).toBe(getPersistedSnapshot());
    expect(result).toEqual({ syncUpload: "complete" });
  });

  it("stores only the target in the vault and encrypts credentials locally", async () => {
    const ctx = createContext();

    await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      syncConfig: ctx.values.syncConfigInput,
    });

    expect(
      ctx.saved.unlockedVaultSession?.unlockedVault.vault.syncTarget,
    ).toEqual(ctx.values.syncTarget);
    expect(ctx.saved.deviceSyncCredentialState).toEqual(
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
      new Error("Rejected local-test-secret-key"),
    );
    let caught: unknown;

    try {
      await ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        syncConfig: ctx.values.syncConfigInput,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(InvalidSyncConfigError);
    expect((caught as Error).cause).toBeUndefined();
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
    vi.mocked(
      ctx.ports.syncProvider.prepareVaultSnapshotUpload,
    ).mockRejectedValue(new Error("upload failed"));

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

  it("retains the candidate and intent when a started upload outcome rejects", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.syncProvider.uploadVaultSnapshot).mockRejectedValueOnce(
      new Error("response lost after upload start"),
    );

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        syncConfig: ctx.values.syncConfigInput,
      }),
    ).resolves.toEqual({ syncUpload: "pending" });

    expect(ctx.ports.syncProvider.uploadVaultSnapshot).toHaveBeenCalledOnce();
    expect(ctx.saved.vaultSnapshot).not.toEqual(ctx.vaultSnapshot);
    expect(
      ctx.saved.unlockedVaultSession?.unlockedVault.vault.syncTarget,
    ).toEqual(ctx.values.syncTarget);
    await expect(
      ctx.ports.crypto.decryptDeviceSyncCredentialState(
        ctx.saved.deviceSyncCredentialState!,
        ctx.values.deviceLocalProtectionKey,
        {
          vaultId: ctx.values.vaultId,
          deviceId: ctx.values.deviceId,
          provider: ctx.values.syncTarget.provider,
          target: ctx.values.syncTarget,
        },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        pendingSnapshotUpload: expect.objectContaining({
          expectedRemoteSnapshotIdentity: null,
        }),
      }),
    );
  });

  it("treats a synchronous start failure as an unknown upload outcome", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.syncProvider.prepareVaultSnapshotUpload,
    ).mockResolvedValueOnce({
      status: "ready",
      start: () => {
        throw new Error("upload start failed");
      },
    });

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        syncConfig: ctx.values.syncConfigInput,
      }),
    ).resolves.toEqual({ syncUpload: "pending" });

    expect(ctx.saved.vaultSnapshot).not.toEqual(ctx.vaultSnapshot);
    expect(ctx.saved.deviceSyncCredentialState).toBeDefined();
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });

  it("restores the pre-setup state when pending-intent staging fails", async () => {
    const ctx = createContext();
    const stagingError = new Error("credential staging failed");
    vi.mocked(
      ctx.ports.crypto.decryptDeviceSyncCredentialState,
    ).mockRejectedValueOnce(stagingError);

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        syncConfig: ctx.values.syncConfigInput,
      }),
    ).rejects.toBe(stagingError);

    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
    expect(ctx.saved.deviceSyncCredentialState).toBeUndefined();
    expect(ctx.saved.vaultSnapshot).toEqual(ctx.vaultSnapshot);
    expect(ctx.saved.localVaultTrustCheckpoint).toEqual(
      ctx.values.localVaultTrustCheckpoint,
    );
    expect(ctx.saved.unlockedVaultSession).toBeDefined();
    expect(
      ctx.saved.unlockedVaultSession?.unlockedVault.vault.syncTarget,
    ).toBeUndefined();
  });

  it("does not let session removal wipe the key during intent staging or start a later upload", async () => {
    const ctx = createContext();
    const decrypt = vi.mocked(
      ctx.ports.crypto.decryptDeviceSyncCredentialState,
    );
    const decryptImplementation = decrypt.getMockImplementation();

    if (decryptImplementation === undefined) {
      throw new Error("Expected credential decryption fixture implementation.");
    }

    let signalStagingStarted: () => void = () => undefined;
    let resumeStaging: () => void = () => undefined;
    const stagingStarted = new Promise<void>((resolve) => {
      signalStagingStarted = resolve;
    });
    const stagingCanContinue = new Promise<void>((resolve) => {
      resumeStaging = resolve;
    });
    decrypt.mockImplementationOnce(async (...args) => {
      signalStagingStarted();
      await stagingCanContinue;
      return decryptImplementation(...args);
    });

    const execution = ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      syncConfig: ctx.values.syncConfigInput,
    });
    const rejectedExecution = expect(execution).rejects.toThrow();
    await stagingStarted;

    let removalCompleted = false;
    const removal = ctx.ports.sessionServices.unlockedVaultSession
      .remove()
      .then(() => {
        removalCompleted = true;
      });
    await Promise.resolve();

    expect(removalCompleted).toBe(false);
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();

    resumeStaging();
    await removal;
    await rejectedExecution;

    expect(ctx.saved.unlockedVaultSession).toBeUndefined();
    expect(ctx.saved.deviceSyncCredentialState).toBeUndefined();
    expect(ctx.saved.vaultSnapshot).toEqual(ctx.vaultSnapshot);
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });

  it("does not start an upload after the session is removed during provider preparation", async () => {
    const ctx = createContext();
    let signalPreparationStarted: () => void = () => undefined;
    let resumePreparation: () => void = () => undefined;
    const preparationStarted = new Promise<void>((resolve) => {
      signalPreparationStarted = resolve;
    });
    const preparationCanContinue = new Promise<void>((resolve) => {
      resumePreparation = resolve;
    });
    vi.mocked(
      ctx.ports.syncProvider.prepareVaultSnapshotUpload,
    ).mockImplementationOnce(
      async (syncAccess, snapshot, expectedRemoteSnapshotIdentity) => {
        signalPreparationStarted();
        await preparationCanContinue;
        return {
          status: "ready",
          start: () => ({
            outcome: ctx.ports.syncProvider.uploadVaultSnapshot(
              syncAccess,
              snapshot,
              expectedRemoteSnapshotIdentity,
            ),
          }),
        };
      },
    );

    const execution = ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      syncConfig: ctx.values.syncConfigInput,
    });
    const rejectedExecution = expect(execution).rejects.toThrow();
    await preparationStarted;

    await ctx.ports.sessionServices.unlockedVaultSession.remove();
    resumePreparation();
    await rejectedExecution;

    expect(ctx.saved.unlockedVaultSession).toBeUndefined();
    expect(ctx.saved.deviceSyncCredentialState).toBeUndefined();
    expect(ctx.saved.vaultSnapshot).toEqual(ctx.vaultSnapshot);
    expect(ctx.ports.syncProvider.uploadVaultSnapshot).not.toHaveBeenCalled();
  });

  it("keeps configured sync and reports pending when initial upload outcome is unknown", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.syncProvider.uploadVaultSnapshot).mockResolvedValueOnce(
      {
        status: "outcome_unknown",
      },
    );

    const result = await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      syncConfig: ctx.values.syncConfigInput,
    });

    expect(result).toEqual({ syncUpload: "pending" });
    expect(
      ctx.saved.unlockedVaultSession?.unlockedVault.vault.syncTarget,
    ).toEqual(ctx.values.syncTarget);
    await expect(
      ctx.ports.crypto.decryptDeviceSyncCredentialState(
        ctx.saved.deviceSyncCredentialState!,
        ctx.values.deviceLocalProtectionKey,
        {
          vaultId: ctx.values.vaultId,
          deviceId: ctx.values.deviceId,
          provider: ctx.values.syncTarget.provider,
          target: ctx.values.syncTarget,
        },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        currentCredentials: ctx.values.syncCredentials,
        pendingSnapshotUpload: expect.objectContaining({
          expectedRemoteSnapshotIdentity: null,
        }),
      }),
    );
    expect(ctx.saved.vaultSnapshot).not.toEqual(ctx.vaultSnapshot);
    expect(
      ctx.ports.sessionServices.unlockedVaultSession
        .commitPersistedSnapshotIfSessionIsActive,
    ).toHaveBeenCalledOnce();
  });
});
