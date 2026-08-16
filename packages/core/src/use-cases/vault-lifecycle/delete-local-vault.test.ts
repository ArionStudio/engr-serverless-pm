import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import { DeleteLocalVaultUseCase } from "./delete-local-vault";
import { VaultMustBeUnlockedForLocalDeletionError } from "../../errors/delete-local-vault.errors";
import type { ClipboardClearTaskRepositoryPort } from "../../ports/clipboard/clipboard-clear-task-repository.port";
import type { ClipboardPort } from "../../ports/clipboard/clipboard.port";
import type { ScheduledTaskPort } from "../../ports/system/scheduled-task.port";
import { ClipboardClearService } from "../../services/clipboard/clipboard-clear.service";
import { VaultLifecycleCleanupService } from "../../services/session/vault-lifecycle-cleanup.service";

function createContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  const clipboard: ClipboardPort = {
    readText: vi.fn(async () => "copied-password"),
    writeText: vi.fn(async () => undefined),
  };
  const clipboardClearTasks: ClipboardClearTaskRepositoryPort = {
    save: vi.fn(async () => undefined),
    get: vi.fn(async () => null),
    remove: vi.fn(async () => undefined),
  };
  const scheduledTasks: ScheduledTaskPort = {
    scheduleTask: vi.fn(async () => undefined),
    cancelTask: vi.fn(async () => undefined),
  };
  const clipboardClear = new ClipboardClearService(
    clipboard,
    clipboardClearTasks,
    ports.clock,
    ports.clipboardSecretHash,
  );
  const clipboardOperations = ports.clipboardOperations;
  const lifecycleCleanup = new VaultLifecycleCleanupService(
    clipboardClear,
    clipboardClearTasks,
    clipboardOperations,
    scheduledTasks,
    ports.vaultLockTasks,
    ports.sessionServices.unlockedVaultSession,
  );
  const useCase = new DeleteLocalVaultUseCase(
    ports.vaultLocalRepository,
    lifecycleCleanup,
  );

  ports.saved.unlockedVaultSession = {
    sessionId: values.sessionId,
    unlockedVault: {
      vaultId: values.vaultId,
      deviceId: values.deviceId,
      vault: values.decryptedVault,
      vaultMasterKey: values.vaultMasterKey,
      devicePrivateSignKey: values.devicePrivateSignKey,
      devicePrivateVaultKey: values.devicePrivateVaultKey,
      deviceLocalProtectionKey: values.deviceLocalProtectionKey,
      trustedSnapshotContext: {
        snapshotDigest: values.vaultSnapshotDigest,
        trust: values.verifiedVaultTrustState,
      },
      vaultTrustAnchor: values.vaultTrustAnchor,
    },
    sourceSnapshotVersionVector: {
      [values.deviceId]: 1,
    },
  };

  return {
    values,
    ports,
    clipboard,
    clipboardClearTasks,
    clipboardOperations,
    scheduledTasks,
    lifecycleCleanup,
    useCase,
  };
}

describe("DeleteLocalVaultUseCase", () => {
  it("removes local vault data and unlocked state when the target vault is unlocked", async () => {
    const ctx = createContext();
    vi.mocked(ctx.clipboardClearTasks.get).mockResolvedValueOnce({
      actionId: "clipboard-action-id",
      copiedValueHash: "hash:copied-password",
      expiresAt: ctx.values.timestamp + 60_000,
    });
    vi.mocked(ctx.ports.vaultLockTasks.get).mockResolvedValueOnce({
      actionId: ctx.values.vaultLockActionId,
      vaultId: ctx.values.vaultId,
      expiresAt: ctx.values.timestamp + 60_000,
    });

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
      }),
    ).resolves.toBeUndefined();

    expect(
      ctx.ports.vaultLocalRepository.removePersistedLocalVault,
    ).toHaveBeenCalledWith(ctx.values.vaultId);
    expect(
      ctx.ports.vaultLocalRepository.removeLocalVaultDescriptor,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.removeDeviceAccessMaterial,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.removeVaultSnapshot,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.sessionServices.unlockedVaultSession.cleanupActiveSession,
    ).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(
        ctx.ports.sessionServices.unlockedVaultSession.cleanupActiveSession,
      ).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(ctx.ports.vaultLocalRepository.removePersistedLocalVault).mock
        .invocationCallOrder[0],
    );
    expect(ctx.clipboard.writeText).toHaveBeenCalledWith("");
    expect(ctx.scheduledTasks.cancelTask).toHaveBeenCalledWith({
      name: "clearClipboard",
      actionId: "clipboard-action-id",
    });
    expect(ctx.scheduledTasks.cancelTask).toHaveBeenCalledWith({
      name: "lockVault",
      actionId: ctx.values.vaultLockActionId,
    });
    expect(ctx.clipboardClearTasks.remove).toHaveBeenCalledTimes(1);
    expect(
      ctx.ports.vaultLockTasks.removeIfActionIsActive,
    ).toHaveBeenCalledTimes(1);
  });

  it("preserves shared session and vault state when clipboard coordination cannot start", async () => {
    const ctx = createContext();
    const error = new Error("clipboard coordination unavailable");
    vi.spyOn(ctx.clipboardOperations, "runExclusive").mockRejectedValueOnce(
      error,
    );

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBe(error);

    expect(ctx.clipboardClearTasks.get).not.toHaveBeenCalled();
    expect(ctx.ports.saved.unlockedVaultSession).toBeDefined();
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .removeUnlockedVaultSessionMaterial,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.removePersistedLocalVault,
    ).not.toHaveBeenCalled();
  });

  it("fails when no vault is unlocked", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSession = undefined;

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
      }),
    ).rejects.toBeInstanceOf(VaultMustBeUnlockedForLocalDeletionError);

    expect(
      ctx.ports.vaultLocalRepository.removePersistedLocalVault,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.sessionServices.unlockedVaultSession.cleanupActiveSession,
    ).toHaveBeenCalledTimes(1);
  });

  it("fails when another vault is unlocked", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSession = {
      ...ctx.ports.saved.unlockedVaultSession!,
      unlockedVault: {
        ...ctx.ports.saved.unlockedVaultSession!.unlockedVault,
        vaultId: "another-vault-id",
      },
    };

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
      }),
    ).rejects.toBeInstanceOf(VaultMustBeUnlockedForLocalDeletionError);

    expect(
      ctx.ports.vaultLocalRepository.removePersistedLocalVault,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.sessionServices.unlockedVaultSession.cleanupActiveSession,
    ).toHaveBeenCalledTimes(1);
  });

  it("fails closed when lifecycle cleanup reports a stale action", async () => {
    const ctx = createContext();
    vi.spyOn(ctx.lifecycleCleanup, "cleanup").mockResolvedValueOnce(
      "stale_action",
    );

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBeInstanceOf(VaultMustBeUnlockedForLocalDeletionError);

    expect(
      ctx.ports.vaultLocalRepository.removePersistedLocalVault,
    ).not.toHaveBeenCalled();
  });

  it("bubbles persisted local deletion errors after removing unlocked state", async () => {
    const ctx = createContext();
    const error = new Error("persisted local deletion failed");

    vi.mocked(
      ctx.ports.vaultLocalRepository.removePersistedLocalVault,
    ).mockRejectedValueOnce(error);

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
      }),
    ).rejects.toBe(error);

    expect(
      ctx.ports.sessionServices.unlockedVaultSession.cleanupActiveSession,
    ).toHaveBeenCalledTimes(1);
    expect(ctx.ports.saved.unlockedVaultSession).toBeUndefined();
  });

  it("does not remove persisted local vault when unlocked state cleanup fails", async () => {
    const ctx = createContext();
    const error = new Error("session cleanup failed");

    vi.mocked(
      ctx.ports.sessionServices.unlockedVaultSession.cleanupActiveSession,
    ).mockRejectedValueOnce(error);

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
      }),
    ).rejects.toBe(error);

    expect(
      ctx.ports.vaultLocalRepository.removePersistedLocalVault,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.vaultLockTasks.get).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLockTasks.removeIfActionIsActive,
    ).not.toHaveBeenCalled();
  });

  it("preserves all state when targeted session identity is unreadable", async () => {
    const ctx = createContext();
    const error = new Error("persisted session identity unavailable");
    vi.mocked(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .getPersistedUnlockedVaultSessionIdentity,
    ).mockRejectedValueOnce(error);

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBe(error);

    expect(ctx.ports.vaultLockTasks.get).not.toHaveBeenCalled();
    expect(ctx.clipboardClearTasks.get).not.toHaveBeenCalled();
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .removeUnlockedVaultSessionMaterial,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.encryptedUnlockedVaultSessionPayloadRepository
        .removeEncryptedUnlockedVaultSessionPayload,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.removePersistedLocalVault,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.saved.unlockedVaultSession).toBeDefined();
  });

  it("does not grant a competing activation lease until deletion finishes", async () => {
    const ctx = createContext();
    let cleanupCanContinue!: () => void;
    let cleanupStartedResolve!: () => void;
    const cleanupStarted = new Promise<void>((resolve) => {
      cleanupStartedResolve = resolve;
    });
    const cleanupCanContinuePromise = new Promise<void>((resolve) => {
      cleanupCanContinue = resolve;
    });
    vi.mocked(ctx.ports.vaultLockTasks.get).mockImplementationOnce(async () => {
      cleanupStartedResolve();
      await cleanupCanContinuePromise;
      return null;
    });
    const removePersistedLocalVault = vi.mocked(
      ctx.ports.vaultLocalRepository.removePersistedLocalVault,
    );
    const removePersistedLocalVaultOriginal =
      removePersistedLocalVault.getMockImplementation();

    if (removePersistedLocalVaultOriginal === undefined) {
      throw new Error("Expected a persisted-vault removal implementation.");
    }

    let deletionCanContinue!: () => void;
    let persistedDeletionStartedResolve!: () => void;
    const persistedDeletionStarted = new Promise<void>((resolve) => {
      persistedDeletionStartedResolve = resolve;
    });
    const deletionCanContinuePromise = new Promise<void>((resolve) => {
      deletionCanContinue = resolve;
    });
    removePersistedLocalVault.mockImplementationOnce(async (vaultId) => {
      persistedDeletionStartedResolve();
      await deletionCanContinuePromise;
      await removePersistedLocalVaultOriginal(vaultId);
    });

    const deletion = ctx.useCase.execute({ vaultId: ctx.values.vaultId });
    await cleanupStarted;
    let activationLeaseGranted = false;
    const competingActivationLease =
      ctx.ports.sessionServices.unlockedVaultSession
        .requireVaultCanBeActivated(ctx.values.vaultId)
        .then((generation) => {
          activationLeaseGranted = true;
          return generation;
        });
    cleanupCanContinue();
    await persistedDeletionStarted;
    await Promise.resolve();
    expect(activationLeaseGranted).toBe(false);
    deletionCanContinue();

    await expect(deletion).resolves.toBeUndefined();
    await expect(competingActivationLease).resolves.toEqual(expect.any(Number));
    expect(
      ctx.ports.vaultLocalRepository.removePersistedLocalVault,
    ).toHaveBeenCalledWith(ctx.values.vaultId);
    expect(ctx.ports.saved.unlockedVaultSession).toBeUndefined();
  });

  it("preserves an unverified active session when target-bound material reading fails", async () => {
    const ctx = createContext();
    const error = new Error("session material unavailable");
    vi.mocked(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .getUnlockedVaultSessionMaterial,
    ).mockRejectedValueOnce(error);
    vi.mocked(ctx.clipboardClearTasks.get).mockResolvedValueOnce({
      actionId: "clipboard-action-id",
      copiedValueHash: "hash:copied-password",
      expiresAt: ctx.values.timestamp + 60_000,
    });
    vi.mocked(ctx.ports.vaultLockTasks.get).mockResolvedValueOnce({
      actionId: ctx.values.vaultLockActionId,
      vaultId: ctx.values.vaultId,
      expiresAt: ctx.values.timestamp + 60_000,
    });

    await expect(
      ctx.useCase.execute({ vaultId: "other-vault-id" }),
    ).rejects.toBe(error);

    expect(ctx.clipboard.writeText).not.toHaveBeenCalled();
    expect(ctx.scheduledTasks.cancelTask).not.toHaveBeenCalled();
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .removeUnlockedVaultSessionMaterial,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.encryptedUnlockedVaultSessionPayloadRepository
        .removeEncryptedUnlockedVaultSessionPayload,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.saved.unlockedVaultSession).toBeDefined();
    expect(
      ctx.ports.vaultLocalRepository.removePersistedLocalVault,
    ).not.toHaveBeenCalled();
  });

  it("continues later cleanup and withholds persisted deletion after clipboard failure", async () => {
    const ctx = createContext();
    const error = new Error("clipboard unavailable");
    vi.mocked(ctx.clipboardClearTasks.get).mockResolvedValueOnce({
      actionId: "clipboard-action-id",
      copiedValueHash: "hash:copied-password",
      expiresAt: ctx.values.timestamp + 60_000,
    });
    vi.mocked(ctx.ports.vaultLockTasks.get).mockResolvedValueOnce({
      actionId: ctx.values.vaultLockActionId,
      vaultId: ctx.values.vaultId,
      expiresAt: ctx.values.timestamp + 60_000,
    });
    vi.mocked(ctx.clipboard.readText).mockRejectedValueOnce(error);

    await expect(
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBe(error);

    expect(ctx.scheduledTasks.cancelTask).not.toHaveBeenCalledWith({
      name: "clearClipboard",
      actionId: "clipboard-action-id",
    });
    expect(ctx.scheduledTasks.cancelTask).toHaveBeenCalledWith({
      name: "lockVault",
      actionId: ctx.values.vaultLockActionId,
    });
    expect(ctx.clipboardClearTasks.remove).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLockTasks.removeIfActionIsActive,
    ).toHaveBeenCalledTimes(1);
    expect(
      ctx.ports.sessionServices.unlockedVaultSession.cleanupActiveSession,
    ).toHaveBeenCalledTimes(1);
    expect(
      ctx.ports.vaultLocalRepository.removePersistedLocalVault,
    ).not.toHaveBeenCalled();
  });
});
