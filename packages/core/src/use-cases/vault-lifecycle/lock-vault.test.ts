import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import {
  saveUnlockedVaultWithEntries,
  singlePasswordEntry,
} from "../../__tests__/fixtures/vault-entries";
import type { ClipboardClearTaskRepositoryPort } from "../../ports/clipboard/clipboard-clear-task-repository.port";
import type { ClipboardPort } from "../../ports/clipboard/clipboard.port";
import type { ScheduledTaskPort } from "../../ports/system/scheduled-task.port";
import { ClipboardClearService } from "../../services/clipboard/clipboard-clear.service";
import { VaultLifecycleCleanupService } from "../../services/session/vault-lifecycle-cleanup.service";
import { UnlockedVaultSessionService } from "../../services/session/unlocked-vault-session.service";
import { UnlockedVaultSessionExpiredError } from "../../errors/vault-session.errors";
import { LockVaultUseCase } from "./lock-vault";

function createContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);

  saveUnlockedVaultWithEntries(ports, values, [singlePasswordEntry]);

  const clipboard: ClipboardPort = {
    readText: vi.fn(async () => singlePasswordEntry.password),
    writeText: vi.fn(async () => undefined),
  };
  const clipboardClearTasks: ClipboardClearTaskRepositoryPort = {
    save: vi.fn(async () => undefined),
    get: vi.fn(async () => null),
    remove: vi.fn(async () => undefined),
  };
  const clipboardOperations = ports.clipboardOperations;
  const clock = {
    now: vi.fn(() => values.timestamp),
  };
  const scheduledTasks: ScheduledTaskPort = {
    scheduleTask: vi.fn(async () => undefined),
    cancelTask: vi.fn(async () => undefined),
  };
  const clipboardClear = new ClipboardClearService(
    clipboard,
    clipboardClearTasks,
    clock,
    ports.clipboardSecretHash,
  );
  const lifecycleCleanup = new VaultLifecycleCleanupService(
    clipboardClear,
    clipboardClearTasks,
    clipboardOperations,
    scheduledTasks,
    ports.vaultLockTasks,
    ports.sessionServices.unlockedVaultSession,
  );
  const useCase = new LockVaultUseCase(lifecycleCleanup);

  return {
    values,
    ports,
    clipboard,
    clipboardClearTasks,
    clipboardOperations,
    scheduledTasks,
    useCase,
  };
}

describe("LockVaultUseCase", () => {
  it("removes the unlocked vault state", async () => {
    const ctx = createContext();

    await expect(ctx.useCase.execute()).resolves.toBeUndefined();

    expect(
      ctx.ports.sessionServices.unlockedVaultSession.cleanupActiveSession,
    ).toHaveBeenCalledTimes(1);
    expect(ctx.ports.saved.unlockedVaultSessionEpoch).toBe(1);
  });

  it("invalidates an activation authorized in another session service before manual lock", async () => {
    const ctx = createContext();
    const previousSession = ctx.ports.saved.unlockedVaultSession;

    if (previousSession === undefined) {
      throw new Error("Expected an active test session.");
    }

    ctx.ports.saved.unlockedVaultSession = undefined;
    const competingSession = new UnlockedVaultSessionService(
      ctx.ports.unlockedVaultSessionMaterialRepository,
      ctx.ports.encryptedUnlockedVaultSessionPayloadRepository,
      ctx.ports.crypto,
      ctx.ports.ids,
      ctx.clipboardOperations,
    );
    const activationAuthorization =
      await competingSession.requireVaultCanBeActivated(ctx.values.vaultId);

    await expect(ctx.useCase.execute()).resolves.toBeUndefined();
    await expect(
      competingSession.activate(
        activationAuthorization,
        previousSession.unlockedVault,
        previousSession.sourceSnapshotVersionVector,
      ),
    ).rejects.toBeInstanceOf(UnlockedVaultSessionExpiredError);

    expect(ctx.ports.saved.unlockedVaultSessionEpoch).toBe(1);
    expect(ctx.ports.saved.unlockedVaultSession).toBeUndefined();
  });

  it("preserves shared lifecycle state when clipboard coordination cannot start", async () => {
    const ctx = createContext();
    const error = new Error("clipboard coordination unavailable");
    vi.spyOn(ctx.clipboardOperations, "runExclusive").mockRejectedValueOnce(
      error,
    );

    await expect(ctx.useCase.execute()).rejects.toBe(error);

    expect(ctx.clipboardClearTasks.get).not.toHaveBeenCalled();
    expect(ctx.ports.vaultLockTasks.get).not.toHaveBeenCalled();
    expect(ctx.ports.saved.unlockedVaultSession).toBeDefined();
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .removeUnlockedVaultSessionMaterial,
    ).not.toHaveBeenCalled();
  });

  it("does not authenticate a scheduled action when coordination cannot start", async () => {
    const ctx = createContext();
    const coordinationError = new Error("clipboard coordination unavailable");
    vi.spyOn(ctx.clipboardOperations, "runExclusive").mockRejectedValueOnce(
      coordinationError,
    );
    await ctx.ports.vaultLockTasks.save({
      actionId: "newer-lock-action-id",
      vaultId: ctx.values.vaultId,
      expiresAt: ctx.values.timestamp + 60_000,
    });

    await expect(
      ctx.useCase.execute({ actionId: ctx.values.vaultLockActionId }),
    ).rejects.toBe(coordinationError);

    expect(ctx.ports.saved.unlockedVaultSession).toBeDefined();
    expect(ctx.clipboardClearTasks.get).not.toHaveBeenCalled();
    expect(ctx.ports.vaultLockTasks.get).not.toHaveBeenCalled();
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .removeUnlockedVaultSessionMaterial,
    ).not.toHaveBeenCalled();
  });

  it("cancels pending scheduled vault lock on manual lock", async () => {
    const ctx = createContext();

    vi.mocked(ctx.ports.vaultLockTasks.get).mockResolvedValueOnce({
      actionId: ctx.values.vaultLockActionId,
      vaultId: ctx.values.vaultId,
      expiresAt: ctx.values.timestamp + 60_000,
    });

    await expect(ctx.useCase.execute()).resolves.toBeUndefined();

    expect(ctx.scheduledTasks.cancelTask).toHaveBeenCalledWith({
      name: "lockVault",
      actionId: ctx.values.vaultLockActionId,
    });
    expect(
      ctx.ports.vaultLockTasks.removeIfActionIsActive,
    ).toHaveBeenCalledTimes(1);
  });

  it("removes lock task metadata when canceling pending scheduled vault lock fails", async () => {
    const ctx = createContext();
    const error = new Error("cancel failed");

    vi.mocked(ctx.ports.vaultLockTasks.get).mockResolvedValueOnce({
      actionId: ctx.values.vaultLockActionId,
      vaultId: ctx.values.vaultId,
      expiresAt: ctx.values.timestamp + 60_000,
    });
    vi.mocked(ctx.scheduledTasks.cancelTask).mockRejectedValueOnce(error);

    await expect(ctx.useCase.execute()).rejects.toThrow(error);

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
  });

  it("ignores stale scheduled vault lock action", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.vaultLockTasks.get).mockResolvedValueOnce({
      actionId: ctx.values.vaultLockActionId,
      vaultId: ctx.values.vaultId,
      expiresAt: ctx.values.timestamp + 60_000,
    });

    await expect(
      ctx.useCase.execute({
        actionId: "stale-vault-lock-action-id",
      }),
    ).resolves.toBeUndefined();

    expect(ctx.clipboardClearTasks.get).not.toHaveBeenCalled();
    expect(ctx.scheduledTasks.cancelTask).not.toHaveBeenCalled();
    expect(ctx.ports.saved.unlockedVaultSession).toBeDefined();
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .removeUnlockedVaultSessionMaterial,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .advanceUnlockedVaultSessionEpoch,
    ).not.toHaveBeenCalled();
  });

  it("preserves the session when lock metadata advances during scheduled cleanup", async () => {
    const ctx = createContext();
    const newerLockTask = {
      actionId: "newer-lock-action-id",
      vaultId: ctx.values.vaultId,
      expiresAt: ctx.values.timestamp + 120_000,
    };
    await ctx.ports.vaultLockTasks.save({
      actionId: ctx.values.vaultLockActionId,
      vaultId: ctx.values.vaultId,
      expiresAt: ctx.values.timestamp + 60_000,
    });
    vi.spyOn(
      ctx.ports.vaultLockTasks,
      "runIfActionIsActive",
    ).mockImplementationOnce(async () => {
      await ctx.ports.vaultLockTasks.save(newerLockTask);
      return { status: "stale_action" };
    });

    await expect(
      ctx.useCase.execute({ actionId: ctx.values.vaultLockActionId }),
    ).resolves.toBeUndefined();

    expect(
      ctx.ports.vaultLockTasks.removeIfActionIsActive,
    ).not.toHaveBeenCalled();
    await expect(ctx.ports.vaultLockTasks.get()).resolves.toBe(newerLockTask);
    expect(ctx.ports.saved.unlockedVaultSession).toBeDefined();
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .advanceUnlockedVaultSessionEpoch,
    ).not.toHaveBeenCalled();
  });

  it("preserves the session when final scheduled lock authentication fails", async () => {
    const ctx = createContext();
    const authenticationError = new Error("lock metadata CAS failed");
    const newerLockTask = {
      actionId: "newer-lock-action-id",
      vaultId: ctx.values.vaultId,
      expiresAt: ctx.values.timestamp + 120_000,
    };
    await ctx.ports.vaultLockTasks.save({
      actionId: ctx.values.vaultLockActionId,
      vaultId: ctx.values.vaultId,
      expiresAt: ctx.values.timestamp + 60_000,
    });
    vi.spyOn(
      ctx.ports.vaultLockTasks,
      "runIfActionIsActive",
    ).mockImplementationOnce(async () => {
      await ctx.ports.vaultLockTasks.save(newerLockTask);
      throw authenticationError;
    });

    await expect(
      ctx.useCase.execute({ actionId: ctx.values.vaultLockActionId }),
    ).rejects.toBe(authenticationError);

    expect(ctx.ports.saved.unlockedVaultSession).toBeDefined();
    await expect(ctx.ports.vaultLockTasks.get()).resolves.toBe(newerLockTask);
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .removeUnlockedVaultSessionMaterial,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .advanceUnlockedVaultSessionEpoch,
    ).not.toHaveBeenCalled();
  });

  it("ignores scheduled vault lock when metadata is missing", async () => {
    const ctx = createContext();

    await expect(
      ctx.useCase.execute({
        actionId: ctx.values.vaultLockActionId,
      }),
    ).resolves.toBeUndefined();

    expect(ctx.ports.saved.unlockedVaultSession).toBeDefined();
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .removeUnlockedVaultSessionMaterial,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLockTasks.removeIfActionIsActive,
    ).not.toHaveBeenCalled();
  });

  it("cleans matching scheduled state when the session is already absent", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSession = undefined;
    await ctx.ports.vaultLockTasks.save({
      actionId: ctx.values.vaultLockActionId,
      vaultId: ctx.values.vaultId,
      expiresAt: ctx.values.timestamp + 60_000,
    });
    vi.mocked(ctx.clipboardClearTasks.get).mockResolvedValueOnce({
      actionId: "clipboard-action-id",
      copiedValueHash: `hash:${singlePasswordEntry.password}`,
      expiresAt: ctx.values.timestamp + 60_000,
    });

    await expect(
      ctx.useCase.execute({ actionId: ctx.values.vaultLockActionId }),
    ).resolves.toBeUndefined();

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
      ctx.ports.vaultLockTasks.removeIfActionIsActive,
    ).toHaveBeenCalledWith(ctx.values.vaultLockActionId);
  });

  it("invalidates an authorized activation when manual lock finds no session", async () => {
    const ctx = createContext();
    const previousSession = ctx.ports.saved.unlockedVaultSession;

    if (previousSession === undefined) {
      throw new Error("Expected an active test session.");
    }

    ctx.ports.saved.unlockedVaultSession = undefined;
    const activationGeneration =
      await ctx.ports.sessionServices.unlockedVaultSession.requireVaultCanBeActivated(
        ctx.values.vaultId,
      );

    await expect(ctx.useCase.execute()).resolves.toBeUndefined();
    await expect(
      ctx.ports.sessionServices.unlockedVaultSession.activate(
        activationGeneration,
        previousSession.unlockedVault,
        previousSession.sourceSnapshotVersionVector,
      ),
    ).rejects.toBeInstanceOf(UnlockedVaultSessionExpiredError);
  });

  it("ignores scheduled vault lock metadata for another active vault", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.vaultLockTasks.get).mockResolvedValueOnce({
      actionId: ctx.values.vaultLockActionId,
      vaultId: "other-vault-id",
      expiresAt: ctx.values.timestamp + 60_000,
    });

    await expect(
      ctx.useCase.execute({ actionId: ctx.values.vaultLockActionId }),
    ).resolves.toBeUndefined();

    expect(ctx.clipboardClearTasks.get).not.toHaveBeenCalled();
    expect(ctx.ports.saved.unlockedVaultSession).toBeDefined();
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .removeUnlockedVaultSessionMaterial,
    ).not.toHaveBeenCalled();
  });

  it("locks current session for matching scheduled vault lock action", async () => {
    const ctx = createContext();
    await ctx.ports.vaultLockTasks.save({
      actionId: ctx.values.vaultLockActionId,
      vaultId: ctx.values.vaultId,
      expiresAt: ctx.values.timestamp + 60_000,
    });

    await expect(
      ctx.useCase.execute({
        actionId: ctx.values.vaultLockActionId,
      }),
    ).resolves.toBeUndefined();

    expect(
      ctx.ports.sessionServices.unlockedVaultSession.cleanupActiveSession,
    ).toHaveBeenCalledTimes(1);
    expect(
      ctx.ports.vaultLockTasks.removeIfActionIsActive,
    ).toHaveBeenCalledTimes(1);
    expect(ctx.ports.saved.unlockedVaultSessionEpoch).toBe(1);
  });

  it("continues authenticated scheduled lock removal when advancing the shared epoch fails", async () => {
    const ctx = createContext();
    const error = new Error("session epoch unavailable");
    await ctx.ports.vaultLockTasks.save({
      actionId: ctx.values.vaultLockActionId,
      vaultId: ctx.values.vaultId,
      expiresAt: ctx.values.timestamp + 60_000,
    });
    vi.mocked(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .advanceUnlockedVaultSessionEpoch,
    ).mockRejectedValueOnce(error);

    await expect(
      ctx.useCase.execute({ actionId: ctx.values.vaultLockActionId }),
    ).rejects.toBe(error);

    expect(
      ctx.ports.vaultLockTasks.removeIfActionIsActive,
    ).toHaveBeenCalledWith(ctx.values.vaultLockActionId);
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .removeUnlockedVaultSessionMaterial,
    ).toHaveBeenCalledTimes(1);
    expect(
      ctx.ports.encryptedUnlockedVaultSessionPayloadRepository
        .removeEncryptedUnlockedVaultSessionPayload,
    ).toHaveBeenCalledTimes(1);
    expect(ctx.ports.saved.unlockedVaultSession).toBeUndefined();
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
    const activeLockTask = {
      actionId: ctx.values.vaultLockActionId,
      vaultId: ctx.values.vaultId,
      expiresAt: ctx.values.timestamp + 60_000,
    };
    await ctx.ports.vaultLockTasks.save(activeLockTask);
    let cleanupCanContinue!: () => void;
    let cleanupStartedResolve!: () => void;
    const cleanupStarted = new Promise<void>((resolve) => {
      cleanupStartedResolve = resolve;
    });
    const cleanupCanContinuePromise = new Promise<void>((resolve) => {
      cleanupCanContinue = resolve;
    });
    vi.mocked(ctx.clipboardClearTasks.get).mockImplementationOnce(async () => {
      cleanupStartedResolve();
      await cleanupCanContinuePromise;
      return null;
    });

    const cleanup = ctx.useCase.execute({
      actionId: ctx.values.vaultLockActionId,
    });
    await cleanupStarted;
    const competingActivation =
      ctx.ports.sessionServices.unlockedVaultSession.activate(
        activationGeneration,
        activeSession.unlockedVault,
        activeSession.sourceSnapshotVersionVector,
      );
    cleanupCanContinue();

    await expect(cleanup).resolves.toBeUndefined();
    await expect(competingActivation).rejects.toBeInstanceOf(
      UnlockedVaultSessionExpiredError,
    );

    expect(ctx.ports.saved.unlockedVaultSession).toBeUndefined();
    expect(
      ctx.ports.vaultLockTasks.removeIfActionIsActive,
    ).toHaveBeenCalledWith(ctx.values.vaultLockActionId);
  });

  it("clears pending copied password before removing unlocked vault state", async () => {
    const ctx = createContext();
    vi.mocked(ctx.clipboardClearTasks.get).mockResolvedValueOnce({
      actionId: "clipboard-action-id",
      copiedValueHash: `hash:${singlePasswordEntry.password}`,
      expiresAt: ctx.values.timestamp + 60_000,
    });

    await expect(ctx.useCase.execute()).resolves.toBeUndefined();

    expect(ctx.clipboard.readText).toHaveBeenCalledTimes(1);
    expect(ctx.clipboard.writeText).toHaveBeenCalledWith("");
    expect(ctx.clipboardClearTasks.remove).toHaveBeenCalledTimes(1);
    expect(ctx.scheduledTasks.cancelTask).toHaveBeenCalledWith({
      name: "clearClipboard",
      actionId: "clipboard-action-id",
    });
    expect(
      ctx.ports.sessionServices.unlockedVaultSession.cleanupActiveSession,
    ).toHaveBeenCalledTimes(1);
  });

  it("removes unlocked vault state when clipboard cleanup fails", async () => {
    const ctx = createContext();
    const error = new Error("clipboard unavailable");

    vi.mocked(ctx.clipboardClearTasks.get).mockResolvedValueOnce({
      actionId: "clipboard-action-id",
      copiedValueHash: `hash:${singlePasswordEntry.password}`,
      expiresAt: ctx.values.timestamp + 60_000,
    });
    vi.mocked(ctx.clipboard.readText).mockRejectedValueOnce(error);

    await expect(ctx.useCase.execute()).rejects.toThrow(error);

    expect(ctx.scheduledTasks.cancelTask).not.toHaveBeenCalledWith({
      name: "clearClipboard",
      actionId: "clipboard-action-id",
    });
    expect(ctx.clipboardClearTasks.remove).not.toHaveBeenCalled();
    expect(
      ctx.ports.sessionServices.unlockedVaultSession.cleanupActiveSession,
    ).toHaveBeenCalledTimes(1);
  });

  it("removes unlocked vault state when reading lock task metadata fails", async () => {
    const ctx = createContext();
    const error = new Error("lock task metadata unavailable");

    vi.mocked(ctx.ports.vaultLockTasks.get).mockRejectedValueOnce(error);
    vi.mocked(ctx.clipboardClearTasks.get).mockResolvedValueOnce({
      actionId: "clipboard-action-id",
      copiedValueHash: `hash:${singlePasswordEntry.password}`,
      expiresAt: ctx.values.timestamp + 60_000,
    });

    await expect(ctx.useCase.execute()).rejects.toBe(error);

    expect(ctx.clipboardClearTasks.get).toHaveBeenCalledTimes(1);
    expect(
      ctx.ports.sessionServices.unlockedVaultSession.cleanupActiveSession,
    ).toHaveBeenCalledTimes(1);
  });

  it("continues all cleanup after reading active session material fails", async () => {
    const ctx = createContext();
    const error = new Error("session material unavailable");
    vi.mocked(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .getUnlockedVaultSessionMaterial,
    ).mockRejectedValueOnce(error);
    vi.mocked(ctx.clipboardClearTasks.get).mockResolvedValueOnce({
      actionId: "clipboard-action-id",
      copiedValueHash: `hash:${singlePasswordEntry.password}`,
      expiresAt: ctx.values.timestamp + 60_000,
    });
    vi.mocked(ctx.ports.vaultLockTasks.get).mockResolvedValueOnce({
      actionId: ctx.values.vaultLockActionId,
      vaultId: ctx.values.vaultId,
      expiresAt: ctx.values.timestamp + 60_000,
    });

    await expect(ctx.useCase.execute()).rejects.toBe(error);

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
    expect(ctx.ports.saved.unlockedVaultSession).toBeUndefined();
  });

  it("authenticates scheduled cleanup after reading active session material fails", async () => {
    const ctx = createContext();
    const error = new Error("session material unavailable");
    await ctx.ports.vaultLockTasks.save({
      actionId: ctx.values.vaultLockActionId,
      vaultId: ctx.values.vaultId,
      expiresAt: ctx.values.timestamp + 60_000,
    });
    vi.mocked(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .getUnlockedVaultSessionMaterial,
    ).mockRejectedValueOnce(error);
    vi.mocked(ctx.clipboardClearTasks.get).mockResolvedValueOnce({
      actionId: "clipboard-action-id",
      copiedValueHash: `hash:${singlePasswordEntry.password}`,
      expiresAt: ctx.values.timestamp + 60_000,
    });
    await expect(
      ctx.useCase.execute({ actionId: ctx.values.vaultLockActionId }),
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
      ctx.ports.vaultLockTasks.removeIfActionIsActive,
    ).toHaveBeenCalledWith(ctx.values.vaultLockActionId);
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .removeUnlockedVaultSessionMaterial,
    ).toHaveBeenCalledTimes(1);
    expect(
      ctx.ports.encryptedUnlockedVaultSessionPayloadRepository
        .removeEncryptedUnlockedVaultSessionPayload,
    ).toHaveBeenCalledTimes(1);
    expect(ctx.ports.saved.unlockedVaultSession).toBeUndefined();
  });

  it("ignores missing scheduled metadata before reading session material", async () => {
    const ctx = createContext();
    const error = new Error("session material unavailable");
    vi.mocked(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .getUnlockedVaultSessionMaterial,
    ).mockRejectedValueOnce(error);

    await expect(
      ctx.useCase.execute({ actionId: ctx.values.vaultLockActionId }),
    ).resolves.toBeUndefined();

    expect(ctx.clipboardClearTasks.get).not.toHaveBeenCalled();
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .getUnlockedVaultSessionMaterial,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.saved.unlockedVaultSession).toBeDefined();
  });

  it("continues scheduled cleanup after lock task metadata read fails", async () => {
    const ctx = createContext();
    const error = new Error("lock task metadata unavailable");
    await ctx.ports.vaultLockTasks.save({
      actionId: ctx.values.vaultLockActionId,
      vaultId: ctx.values.vaultId,
      expiresAt: ctx.values.timestamp + 60_000,
    });
    vi.mocked(ctx.ports.vaultLockTasks.get).mockRejectedValueOnce(error);
    vi.mocked(ctx.clipboardClearTasks.get).mockResolvedValueOnce({
      actionId: "clipboard-action-id",
      copiedValueHash: `hash:${singlePasswordEntry.password}`,
      expiresAt: ctx.values.timestamp + 60_000,
    });

    await expect(
      ctx.useCase.execute({ actionId: ctx.values.vaultLockActionId }),
    ).rejects.toBe(error);

    expect(
      ctx.ports.vaultLockTasks.removeIfActionIsActive,
    ).toHaveBeenCalledWith(ctx.values.vaultLockActionId);
    expect(ctx.clipboard.writeText).toHaveBeenCalledWith("");
    expect(ctx.scheduledTasks.cancelTask).toHaveBeenCalledWith({
      name: "lockVault",
      actionId: ctx.values.vaultLockActionId,
    });
    expect(ctx.ports.saved.unlockedVaultSession).toBeUndefined();
  });

  it("preserves the session when lock metadata advances after read-failure authentication", async () => {
    const ctx = createContext();
    const readError = new Error("lock task metadata unavailable");
    const newerLockTask = {
      actionId: "newer-lock-action-id",
      vaultId: ctx.values.vaultId,
      expiresAt: ctx.values.timestamp + 120_000,
    };
    await ctx.ports.vaultLockTasks.save({
      actionId: ctx.values.vaultLockActionId,
      vaultId: ctx.values.vaultId,
      expiresAt: ctx.values.timestamp + 60_000,
    });
    vi.mocked(ctx.ports.vaultLockTasks.get).mockRejectedValueOnce(readError);
    vi.mocked(ctx.clipboardClearTasks.get).mockResolvedValueOnce({
      actionId: "clipboard-action-id",
      copiedValueHash: `hash:${singlePasswordEntry.password}`,
      expiresAt: ctx.values.timestamp + 60_000,
    });
    vi.spyOn(
      ctx.ports.vaultLockTasks,
      "runIfActionIsActive",
    ).mockImplementationOnce(async () => {
      await ctx.ports.vaultLockTasks.save(newerLockTask);
      throw readError;
    });

    await expect(
      ctx.useCase.execute({ actionId: ctx.values.vaultLockActionId }),
    ).rejects.toBe(readError);

    expect(ctx.clipboard.writeText).not.toHaveBeenCalled();
    await expect(ctx.ports.vaultLockTasks.get()).resolves.toBe(newerLockTask);
    expect(ctx.ports.saved.unlockedVaultSession).toBeDefined();
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .removeUnlockedVaultSessionMaterial,
    ).not.toHaveBeenCalled();
  });

  it("preserves clipboard and session ownership when the action claim fails", async () => {
    const ctx = createContext();
    const readError = new Error("lock task metadata unavailable");
    const authenticationError = new Error("lock task authentication failed");
    vi.mocked(ctx.ports.vaultLockTasks.get).mockRejectedValueOnce(readError);
    vi.spyOn(
      ctx.ports.vaultLockTasks,
      "runIfActionIsActive",
    ).mockRejectedValueOnce(authenticationError);
    vi.mocked(ctx.clipboardClearTasks.get).mockResolvedValueOnce({
      actionId: "clipboard-action-id",
      copiedValueHash: `hash:${singlePasswordEntry.password}`,
      expiresAt: ctx.values.timestamp + 60_000,
    });

    await expect(
      ctx.useCase.execute({ actionId: ctx.values.vaultLockActionId }),
    ).rejects.toBe(readError);

    expect(ctx.clipboard.writeText).not.toHaveBeenCalled();
    expect(ctx.scheduledTasks.cancelTask).not.toHaveBeenCalled();
    expect(ctx.ports.saved.unlockedVaultSession).toBeDefined();
    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .removeUnlockedVaultSessionMaterial,
    ).not.toHaveBeenCalled();
  });

  it("preserves unknown clipboard ownership when reading its metadata fails", async () => {
    const ctx = createContext();
    const error = new Error("clipboard task metadata unavailable");

    vi.mocked(ctx.ports.vaultLockTasks.get).mockResolvedValueOnce({
      actionId: ctx.values.vaultLockActionId,
      vaultId: ctx.values.vaultId,
      expiresAt: ctx.values.timestamp + 60_000,
    });
    vi.mocked(ctx.clipboardClearTasks.get).mockRejectedValueOnce(error);

    await expect(ctx.useCase.execute()).rejects.toBe(error);

    expect(ctx.scheduledTasks.cancelTask).toHaveBeenCalledWith({
      name: "lockVault",
      actionId: ctx.values.vaultLockActionId,
    });
    expect(
      ctx.ports.vaultLockTasks.removeIfActionIsActive,
    ).toHaveBeenCalledWith(ctx.values.vaultLockActionId);
    expect(ctx.clipboardClearTasks.remove).not.toHaveBeenCalled();
    expect(
      ctx.ports.sessionServices.unlockedVaultSession.cleanupActiveSession,
    ).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, "scheduled"] as const)(
    "continues every cleanup phase when persisted session identity is unreadable (%s)",
    async (mode) => {
      const ctx = createContext();
      const error = new Error("persisted session identity unavailable");
      const actionId =
        mode === "scheduled" ? ctx.values.vaultLockActionId : undefined;
      vi.mocked(
        ctx.ports.unlockedVaultSessionMaterialRepository
          .getPersistedUnlockedVaultSessionIdentity,
      ).mockRejectedValueOnce(error);
      await ctx.ports.vaultLockTasks.save({
        actionId: ctx.values.vaultLockActionId,
        vaultId: ctx.values.vaultId,
        expiresAt: ctx.values.timestamp + 60_000,
      });
      vi.mocked(ctx.clipboardClearTasks.get).mockResolvedValueOnce({
        actionId: "clipboard-action-id",
        copiedValueHash: `hash:${singlePasswordEntry.password}`,
        expiresAt: ctx.values.timestamp + 60_000,
      });

      await expect(ctx.useCase.execute({ actionId })).rejects.toBe(error);

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
      ).toHaveBeenCalledWith(ctx.values.vaultLockActionId);
      expect(
        ctx.ports.unlockedVaultSessionMaterialRepository
          .removeUnlockedVaultSessionMaterial,
      ).toHaveBeenCalledTimes(1);
      expect(
        ctx.ports.encryptedUnlockedVaultSessionPayloadRepository
          .removeEncryptedUnlockedVaultSessionPayload,
      ).toHaveBeenCalledTimes(1);
      expect(ctx.ports.saved.unlockedVaultSession).toBeUndefined();
    },
  );

  it("preserves clipboard cleanup error when unlocked vault state removal also fails", async () => {
    const ctx = createContext();
    const cleanupError = new Error("clipboard unavailable");
    const removeError = new Error("session removal failed");

    vi.mocked(ctx.clipboardClearTasks.get).mockResolvedValueOnce({
      actionId: "clipboard-action-id",
      copiedValueHash: `hash:${singlePasswordEntry.password}`,
      expiresAt: ctx.values.timestamp + 60_000,
    });
    vi.mocked(ctx.clipboard.readText).mockRejectedValueOnce(cleanupError);
    vi.mocked(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .removeUnlockedVaultSessionMaterial,
    ).mockRejectedValueOnce(removeError);

    await expect(ctx.useCase.execute()).rejects.toBe(cleanupError);

    expect(
      ctx.ports.sessionServices.unlockedVaultSession.cleanupActiveSession,
    ).toHaveBeenCalledTimes(1);
  });

  it("retains lock ownership after session removal fails and cleans it on retry", async () => {
    const ctx = createContext();
    const clipboardError = new Error("clipboard unavailable");
    const sessionRemoveError = new Error("session removal failed");

    await ctx.ports.vaultLockTasks.save({
      actionId: ctx.values.vaultLockActionId,
      vaultId: ctx.values.vaultId,
      expiresAt: ctx.values.timestamp + 60_000,
    });
    vi.mocked(ctx.clipboardClearTasks.get).mockResolvedValueOnce({
      actionId: "clipboard-action-id",
      copiedValueHash: `hash:${singlePasswordEntry.password}`,
      expiresAt: ctx.values.timestamp + 60_000,
    });
    vi.mocked(ctx.clipboard.readText).mockRejectedValueOnce(clipboardError);
    vi.mocked(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .removeUnlockedVaultSessionMaterial,
    ).mockRejectedValueOnce(sessionRemoveError);

    await expect(ctx.useCase.execute()).rejects.toBe(clipboardError);

    expect(ctx.scheduledTasks.cancelTask).not.toHaveBeenCalledWith({
      name: "lockVault",
      actionId: ctx.values.vaultLockActionId,
    });
    expect(ctx.clipboardClearTasks.remove).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLockTasks.removeIfActionIsActive,
    ).not.toHaveBeenCalled();
    await expect(ctx.ports.vaultLockTasks.get()).resolves.toMatchObject({
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

    await expect(ctx.useCase.execute()).resolves.toBeUndefined();
    expect(ctx.scheduledTasks.cancelTask).toHaveBeenCalledWith({
      name: "lockVault",
      actionId: ctx.values.vaultLockActionId,
    });
    expect(
      ctx.ports.vaultLockTasks.removeIfActionIsActive,
    ).toHaveBeenCalledWith(ctx.values.vaultLockActionId);
    await expect(ctx.ports.vaultLockTasks.get()).resolves.toBeNull();
  });

  it("retries orphaned encrypted payload removal before releasing lock ownership", async () => {
    const ctx = createContext();
    const payloadRemovalError = new Error("session payload removal failed");

    await ctx.ports.vaultLockTasks.save({
      actionId: ctx.values.vaultLockActionId,
      vaultId: ctx.values.vaultId,
      expiresAt: ctx.values.timestamp + 60_000,
    });
    vi.mocked(
      ctx.ports.encryptedUnlockedVaultSessionPayloadRepository
        .removeEncryptedUnlockedVaultSessionPayload,
    ).mockRejectedValueOnce(payloadRemovalError);

    await expect(
      ctx.useCase.execute({ actionId: ctx.values.vaultLockActionId }),
    ).rejects.toBe(payloadRemovalError);

    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .removeUnlockedVaultSessionMaterial,
    ).toHaveBeenCalledTimes(1);
    expect(
      ctx.ports.encryptedUnlockedVaultSessionPayloadRepository
        .removeEncryptedUnlockedVaultSessionPayload,
    ).toHaveBeenCalledTimes(1);
    expect(ctx.ports.saved.encryptedUnlockedVaultSessionPayload).toBeDefined();
    expect(
      ctx.ports.vaultLockTasks.removeIfActionIsActive,
    ).not.toHaveBeenCalled();
    expect(ctx.scheduledTasks.cancelTask).not.toHaveBeenCalledWith({
      name: "lockVault",
      actionId: ctx.values.vaultLockActionId,
    });

    await expect(
      ctx.useCase.execute({ actionId: ctx.values.vaultLockActionId }),
    ).resolves.toBeUndefined();

    expect(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .removeUnlockedVaultSessionMaterial,
    ).toHaveBeenCalledTimes(2);
    expect(
      ctx.ports.encryptedUnlockedVaultSessionPayloadRepository
        .removeEncryptedUnlockedVaultSessionPayload,
    ).toHaveBeenCalledTimes(2);
    expect(
      ctx.ports.saved.encryptedUnlockedVaultSessionPayload,
    ).toBeUndefined();
    expect(
      ctx.ports.vaultLockTasks.removeIfActionIsActive,
    ).toHaveBeenCalledWith(ctx.values.vaultLockActionId);
    expect(ctx.scheduledTasks.cancelTask).toHaveBeenCalledWith({
      name: "lockVault",
      actionId: ctx.values.vaultLockActionId,
    });
    await expect(ctx.ports.vaultLockTasks.get()).resolves.toBeNull();
  });

  it("removes unlocked vault state when clipboard clear task cancellation fails", async () => {
    const ctx = createContext();
    const error = new Error("cancel failed");

    vi.mocked(ctx.ports.vaultLockTasks.get).mockResolvedValueOnce({
      actionId: ctx.values.vaultLockActionId,
      vaultId: ctx.values.vaultId,
      expiresAt: ctx.values.timestamp + 60_000,
    });
    vi.mocked(ctx.clipboardClearTasks.get).mockResolvedValueOnce({
      actionId: "clipboard-action-id",
      copiedValueHash: `hash:${singlePasswordEntry.password}`,
      expiresAt: ctx.values.timestamp + 60_000,
    });
    vi.mocked(ctx.scheduledTasks.cancelTask).mockRejectedValueOnce(error);

    await expect(ctx.useCase.execute()).rejects.toThrow(error);

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
  });

  it("continues cleanup when clipboard task metadata removal fails", async () => {
    const ctx = createContext();
    const error = new Error("clipboard metadata removal failed");

    vi.mocked(ctx.ports.vaultLockTasks.get).mockResolvedValueOnce({
      actionId: ctx.values.vaultLockActionId,
      vaultId: ctx.values.vaultId,
      expiresAt: ctx.values.timestamp + 60_000,
    });
    vi.mocked(ctx.clipboardClearTasks.get).mockRejectedValueOnce(error);
    vi.mocked(ctx.clipboardClearTasks.remove).mockRejectedValueOnce(error);

    await expect(ctx.useCase.execute()).rejects.toBe(error);

    expect(ctx.scheduledTasks.cancelTask).toHaveBeenCalledWith({
      name: "lockVault",
      actionId: ctx.values.vaultLockActionId,
    });
    expect(
      ctx.ports.vaultLockTasks.removeIfActionIsActive,
    ).toHaveBeenCalledWith(ctx.values.vaultLockActionId);
    expect(
      ctx.ports.sessionServices.unlockedVaultSession.cleanupActiveSession,
    ).toHaveBeenCalledTimes(1);
  });

  it("continues session cleanup when lock task metadata removal fails", async () => {
    const ctx = createContext();
    const error = new Error("lock metadata removal failed");
    vi.mocked(ctx.ports.vaultLockTasks.get).mockResolvedValueOnce({
      actionId: ctx.values.vaultLockActionId,
      vaultId: ctx.values.vaultId,
      expiresAt: ctx.values.timestamp + 60_000,
    });
    vi.mocked(
      ctx.ports.vaultLockTasks.removeIfActionIsActive,
    ).mockRejectedValueOnce(error);

    await expect(ctx.useCase.execute()).rejects.toBe(error);

    expect(
      ctx.ports.sessionServices.unlockedVaultSession.cleanupActiveSession,
    ).toHaveBeenCalledTimes(1);
    expect(ctx.scheduledTasks.cancelTask).not.toHaveBeenCalledWith({
      name: "lockVault",
      actionId: ctx.values.vaultLockActionId,
    });
  });

  it("bubbles repository errors", async () => {
    const ctx = createContext();
    const error = new Error("lock failed");

    vi.mocked(
      ctx.ports.sessionServices.unlockedVaultSession.cleanupActiveSession,
    ).mockRejectedValueOnce(error);

    await expect(ctx.useCase.execute()).rejects.toThrow(error);
  });
});
