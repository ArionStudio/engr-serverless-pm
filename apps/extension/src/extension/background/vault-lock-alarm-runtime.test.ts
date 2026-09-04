import type {
  ClipboardPort,
  EncryptedUnlockedVaultSessionPayloadRepositoryPort,
  IdPort,
  ScheduledTaskPort,
  UnlockedVaultSessionMaterialRepositoryPort,
} from "@lfspm/core";
import { LockVaultUseCase } from "@lfspm/core";
import {
  ClipboardClearService,
  UnlockedVaultSessionService,
  VaultLifecycleCleanupService,
} from "@lfspm/core/services";
import { describe, expect, it, vi } from "vitest";
import { createChromeStorageArea } from "../../__tests__/fixtures/chrome-storage-area";
import {
  type WebLockManager,
  WebCryptoClipboardSecretHashAdapter,
  WebLocksClipboardOperationCoordinatorAdapter,
} from "../../adapters/clipboard";
import { WebCryptoAdapter } from "../../adapters/crypto";
import {
  ChromeClipboardClearTaskRepositoryAdapter,
  ChromeVaultLockTaskRepositoryAdapter,
} from "../../adapters/storage";
import {
  InvalidScheduledTaskRecordError,
  SCHEDULED_TASK_ALARM_PREFIX,
  serializeScheduledTask,
} from "../../adapters/system";
import {
  createVaultLockAlarmHandler,
  VAULT_LOCK_RETRY_DELAY_MS,
} from "./clipboard-alarm-runtime";

const immediateLockManager: WebLockManager = {
  request: async (_name, operation) => operation(null),
};

function createContext() {
  const { storageArea } = createChromeStorageArea();
  const clipboardClearTasks = new ChromeClipboardClearTaskRepositoryAdapter(
    storageArea,
  );
  const vaultLockTasks = new ChromeVaultLockTaskRepositoryAdapter(
    storageArea,
    immediateLockManager,
  );
  const clipboard: ClipboardPort = {
    readText: vi.fn(async () => "copied-password"),
    writeText: vi.fn(async () => undefined),
  };
  const scheduledTasks: ScheduledTaskPort = {
    scheduleTask: vi.fn(async () => undefined),
    cancelTask: vi.fn(async () => undefined),
  };
  const materialRepository: UnlockedVaultSessionMaterialRepositoryPort = {
    getUnlockedVaultSessionEpoch: vi.fn(async () => 0),
    advanceUnlockedVaultSessionEpoch: vi.fn(async () => undefined),
    saveUnlockedVaultSessionMaterial: vi.fn(async () => undefined),
    getUnlockedVaultSessionMaterial: vi.fn(async () => null),
    getPersistedUnlockedVaultSessionIdentity: vi.fn(async () => null),
    evictCachedUnlockedVaultSessionMaterial: vi.fn(async () => undefined),
    removeUnlockedVaultSessionMaterial: vi.fn(async () => undefined),
  };
  const encryptedPayloadRepository: EncryptedUnlockedVaultSessionPayloadRepositoryPort =
    {
      saveEncryptedUnlockedVaultSessionPayload: vi.fn(async () => undefined),
      getEncryptedUnlockedVaultSessionPayload: vi.fn(async () => null),
      removeEncryptedUnlockedVaultSessionPayload: vi.fn(async () => undefined),
    };
  const ids: IdPort = {
    generateId: vi.fn(async () => "unused-id"),
  };
  const clipboardOperations = new WebLocksClipboardOperationCoordinatorAdapter(
    immediateLockManager,
  );
  const clipboardClear = new ClipboardClearService(
    clipboard,
    clipboardClearTasks,
    { now: () => 1_000 },
    new WebCryptoClipboardSecretHashAdapter(),
  );
  const unlockedVaultSession = new UnlockedVaultSessionService(
    materialRepository,
    encryptedPayloadRepository,
    new WebCryptoAdapter(),
    ids,
    clipboardOperations,
  );
  const lifecycleCleanup = new VaultLifecycleCleanupService(
    clipboardClear,
    clipboardClearTasks,
    clipboardOperations,
    scheduledTasks,
    vaultLockTasks,
    unlockedVaultSession,
  );

  return {
    clipboard,
    clipboardClearTasks,
    encryptedPayloadRepository,
    handleAlarm: createVaultLockAlarmHandler(
      new LockVaultUseCase(lifecycleCleanup),
      vaultLockTasks,
      scheduledTasks,
      { now: () => 1_000 },
    ),
    materialRepository,
    scheduledTasks,
    vaultLockTasks,
  };
}

describe("vault-lock alarm runtime", () => {
  it("preserves all active ownership for a mismatched alarm action", async () => {
    const ctx = createContext();
    await ctx.vaultLockTasks.save({
      actionId: "active-lock-action",
      vaultId: "vault-id",
      expiresAt: 1_000,
    });
    await ctx.clipboardClearTasks.save({
      actionId: "active-clipboard-action",
      copiedValueHash: "a".repeat(64),
      expiresAt: 1_000,
    });
    const removeVaultLockTask = vi.spyOn(
      ctx.vaultLockTasks,
      "removeIfActionIsActive",
    );
    const removeClipboardTask = vi.spyOn(ctx.clipboardClearTasks, "remove");

    await ctx.handleAlarm({
      name: serializeScheduledTask({
        name: "lockVault",
        actionId: "stale-lock-action",
      }),
    });

    expect(ctx.clipboard.readText).not.toHaveBeenCalled();
    expect(ctx.clipboard.writeText).not.toHaveBeenCalled();
    expect(removeClipboardTask).not.toHaveBeenCalled();
    expect(removeVaultLockTask).not.toHaveBeenCalled();
    expect(ctx.scheduledTasks.scheduleTask).not.toHaveBeenCalled();
    expect(ctx.scheduledTasks.cancelTask).not.toHaveBeenCalled();
    expect(
      ctx.materialRepository.removeUnlockedVaultSessionMaterial,
    ).not.toHaveBeenCalled();
    expect(
      ctx.encryptedPayloadRepository.removeEncryptedUnlockedVaultSessionPayload,
    ).not.toHaveBeenCalled();
    await expect(ctx.vaultLockTasks.get()).resolves.toMatchObject({
      actionId: "active-lock-action",
    });
    await expect(ctx.clipboardClearTasks.get()).resolves.toMatchObject({
      actionId: "active-clipboard-action",
    });
  });

  it("rejects a hostile scheduled alarm before invoking the lock workflow", async () => {
    const ctx = createContext();
    const getVaultLockTask = vi.spyOn(ctx.vaultLockTasks, "get");
    const getClipboardTask = vi.spyOn(ctx.clipboardClearTasks, "get");

    await expect(
      ctx.handleAlarm({
        name: `${SCHEDULED_TASK_ALARM_PREFIX}lockVault:%61ction-id`,
      }),
    ).rejects.toBeInstanceOf(InvalidScheduledTaskRecordError);

    expect(getVaultLockTask).not.toHaveBeenCalled();
    expect(getClipboardTask).not.toHaveBeenCalled();
    expect(ctx.clipboard.readText).not.toHaveBeenCalled();
    expect(ctx.clipboard.writeText).not.toHaveBeenCalled();
    expect(ctx.scheduledTasks.scheduleTask).not.toHaveBeenCalled();
    expect(ctx.scheduledTasks.cancelTask).not.toHaveBeenCalled();
    expect(
      ctx.materialRepository.removeUnlockedVaultSessionMaterial,
    ).not.toHaveBeenCalled();
    expect(
      ctx.encryptedPayloadRepository.removeEncryptedUnlockedVaultSessionPayload,
    ).not.toHaveBeenCalled();
  });

  it("retains a retry after transient lock failure and cleans matching ownership on retry", async () => {
    const ctx = createContext();
    const task = {
      name: "lockVault" as const,
      actionId: "active-lock-action",
    };
    const error = new Error("session removal failed");
    await ctx.vaultLockTasks.save({
      actionId: task.actionId,
      vaultId: "vault-id",
      expiresAt: 1_000,
    });
    const execute = vi
      .fn<({ actionId }: { actionId: string }) => Promise<void>>()
      .mockRejectedValueOnce(error)
      .mockImplementationOnce(async ({ actionId }) => {
        await ctx.vaultLockTasks.removeIfActionIsActive(actionId);
      });
    const handleAlarm = createVaultLockAlarmHandler(
      { execute },
      ctx.vaultLockTasks,
      ctx.scheduledTasks,
      { now: () => 1_000 },
    );
    const alarm = { name: serializeScheduledTask(task) };

    await expect(handleAlarm(alarm)).rejects.toBe(error);

    expect(ctx.scheduledTasks.scheduleTask).toHaveBeenCalledWith({
      task,
      runAt: 1_000 + VAULT_LOCK_RETRY_DELAY_MS,
    });
    expect(ctx.scheduledTasks.cancelTask).not.toHaveBeenCalled();
    await expect(ctx.vaultLockTasks.get()).resolves.toMatchObject({
      actionId: task.actionId,
    });

    await expect(handleAlarm(alarm)).resolves.toBeUndefined();

    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenLastCalledWith({ actionId: task.actionId });
    expect(ctx.scheduledTasks.cancelTask).toHaveBeenCalledWith(task);
    await expect(ctx.vaultLockTasks.get()).resolves.toBeNull();
  });

  it("keeps the pre-armed retry when lock metadata removal fails", async () => {
    const ctx = createContext();
    const task = {
      name: "lockVault" as const,
      actionId: "active-lock-action",
    };
    const removalError = new Error("lock metadata removal failed");
    await ctx.vaultLockTasks.save({
      actionId: task.actionId,
      vaultId: "vault-id",
      expiresAt: 1_000,
    });
    const removeIfActionIsActive = vi.spyOn(
      ctx.vaultLockTasks,
      "removeIfActionIsActive",
    );
    removeIfActionIsActive.mockRejectedValueOnce(removalError);
    const alarm = { name: serializeScheduledTask(task) };

    await expect(ctx.handleAlarm(alarm)).rejects.toBe(removalError);

    expect(ctx.scheduledTasks.scheduleTask).toHaveBeenCalledWith({
      task,
      runAt: 1_000 + VAULT_LOCK_RETRY_DELAY_MS,
    });
    expect(ctx.scheduledTasks.cancelTask).not.toHaveBeenCalled();
    await expect(ctx.vaultLockTasks.get()).resolves.toMatchObject({
      actionId: task.actionId,
    });

    await expect(ctx.handleAlarm(alarm)).resolves.toBeUndefined();

    await expect(ctx.vaultLockTasks.get()).resolves.toBeNull();
    expect(ctx.scheduledTasks.cancelTask).toHaveBeenCalledWith(task);

    await ctx.vaultLockTasks.save({
      actionId: "newer-lock-action",
      vaultId: "vault-id",
      expiresAt: 2_000,
    });
    const removalCalls = removeIfActionIsActive.mock.calls.length;

    await expect(ctx.handleAlarm(alarm)).resolves.toBeUndefined();

    expect(removeIfActionIsActive).toHaveBeenCalledTimes(removalCalls);
    await expect(ctx.vaultLockTasks.get()).resolves.toMatchObject({
      actionId: "newer-lock-action",
    });
  });

  it("re-arms a valid alarm when lock ownership cannot be read", async () => {
    const ctx = createContext();
    const task = {
      name: "lockVault" as const,
      actionId: "active-lock-action",
    };
    const error = new Error("lock ownership unavailable");
    vi.spyOn(ctx.vaultLockTasks, "get").mockRejectedValueOnce(error);

    await expect(
      ctx.handleAlarm({ name: serializeScheduledTask(task) }),
    ).rejects.toBe(error);

    expect(ctx.scheduledTasks.scheduleTask).toHaveBeenCalledWith({
      task,
      runAt: 1_000 + VAULT_LOCK_RETRY_DELAY_MS,
    });
    expect(ctx.scheduledTasks.cancelTask).not.toHaveBeenCalled();
  });
});
