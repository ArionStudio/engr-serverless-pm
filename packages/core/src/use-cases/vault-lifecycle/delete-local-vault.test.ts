import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import { DeleteLocalVaultUseCase } from "./delete-local-vault";
import { VaultMustBeUnlockedForLocalDeletionError } from "../../errors/delete-local-vault.errors";
import { UnlockedVaultSessionExpiredError } from "../../errors/vault-session.errors";
import type { ClipboardClearTaskRepositoryPort } from "../../ports/clipboard/clipboard-clear-task-repository.port";
import type { ClipboardPort } from "../../ports/clipboard/clipboard.port";
import type { ScheduledTaskPort } from "../../ports/system/scheduled-task.port";
import { ClipboardClearService } from "../../services/clipboard/clipboard-clear.service";

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
    ports.crypto,
  );
  const useCase = new DeleteLocalVaultUseCase(
    ports.vaultLocalRepository,
    ports.sessionServices.unlockedVaultSession,
    clipboardClear,
    clipboardClearTasks,
    scheduledTasks,
    ports.vaultLockTasks,
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
    scheduledTasks,
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

  it("serializes cleanup against a competing session activation", async () => {
    const ctx = createContext();
    const activeSession = ctx.ports.saved.unlockedVaultSession;

    if (activeSession === undefined) {
      throw new Error("Expected an active test session.");
    }

    const activationGeneration =
      await ctx.ports.sessionServices.unlockedVaultSession.requireVaultCanBeActivated(
        ctx.values.vaultId,
      );
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

    const deletion = ctx.useCase.execute({ vaultId: ctx.values.vaultId });
    await cleanupStarted;
    const competingActivation =
      ctx.ports.sessionServices.unlockedVaultSession.activate(
        activationGeneration,
        activeSession.unlockedVault,
        activeSession.sourceSnapshotVersionVector,
      );
    cleanupCanContinue();

    await expect(deletion).resolves.toBeUndefined();
    await expect(competingActivation).rejects.toBeInstanceOf(
      UnlockedVaultSessionExpiredError,
    );
    expect(
      ctx.ports.vaultLocalRepository.removePersistedLocalVault,
    ).toHaveBeenCalledWith(ctx.values.vaultId);
    expect(ctx.ports.saved.unlockedVaultSession).toBeUndefined();
  });

  it("continues cleanup and withholds deletion after reading session material fails", async () => {
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
      ctx.useCase.execute({ vaultId: ctx.values.vaultId }),
    ).rejects.toBe(error);

    expect(ctx.clipboard.writeText).toHaveBeenCalledWith("");
    expect(ctx.scheduledTasks.cancelTask).toHaveBeenCalledWith({
      name: "clearClipboard",
      actionId: "clipboard-action-id",
    });
    expect(ctx.scheduledTasks.cancelTask).toHaveBeenCalledWith({
      name: "lockVault",
      actionId: ctx.values.vaultLockActionId,
    });
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .removeUnlockedVaultSessionMaterial,
    ).toHaveBeenCalledTimes(1);
    expect(
      ctx.ports.encryptedUnlockedVaultSessionPayloadRepository
        .removeEncryptedUnlockedVaultSessionPayload,
    ).toHaveBeenCalledTimes(1);
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

    expect(ctx.scheduledTasks.cancelTask).toHaveBeenCalledWith({
      name: "clearClipboard",
      actionId: "clipboard-action-id",
    });
    expect(ctx.scheduledTasks.cancelTask).toHaveBeenCalledWith({
      name: "lockVault",
      actionId: ctx.values.vaultLockActionId,
    });
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
