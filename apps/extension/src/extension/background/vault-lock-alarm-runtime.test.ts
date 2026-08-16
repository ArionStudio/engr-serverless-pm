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
  WebCryptoClipboardSecretHash,
  WebLocksClipboardOperationCoordinator,
} from "../../adapters/clipboard";
import { WebCryptoPort } from "../../adapters/crypto";
import {
  ChromeClipboardClearTaskRepository,
  ChromeVaultLockTaskRepository,
} from "../../adapters/storage";
import {
  InvalidScheduledTaskRecordError,
  SCHEDULED_TASK_ALARM_PREFIX,
  serializeScheduledTask,
} from "../../adapters/system";
import { createVaultLockAlarmHandler } from "./clipboard-alarm-runtime";

const immediateLockManager: WebLockManager = {
  request: async (_name, operation) => operation(null),
};

function createContext() {
  const { storageArea } = createChromeStorageArea();
  const clipboardClearTasks = new ChromeClipboardClearTaskRepository(
    storageArea,
  );
  const vaultLockTasks = new ChromeVaultLockTaskRepository(
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
  const clipboardOperations = new WebLocksClipboardOperationCoordinator(
    immediateLockManager,
  );
  const clipboardClear = new ClipboardClearService(
    clipboard,
    clipboardClearTasks,
    { now: () => 1_000 },
    new WebCryptoClipboardSecretHash(),
  );
  const unlockedVaultSession = new UnlockedVaultSessionService(
    materialRepository,
    encryptedPayloadRepository,
    new WebCryptoPort(),
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
    expect(ctx.scheduledTasks.cancelTask).not.toHaveBeenCalled();
    expect(
      ctx.materialRepository.removeUnlockedVaultSessionMaterial,
    ).not.toHaveBeenCalled();
    expect(
      ctx.encryptedPayloadRepository.removeEncryptedUnlockedVaultSessionPayload,
    ).not.toHaveBeenCalled();
  });
});
