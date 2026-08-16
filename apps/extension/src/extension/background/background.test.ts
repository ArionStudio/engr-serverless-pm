import type { ClipboardPort } from "@lfspm/core";
import { ClearClipboardTaskUseCase } from "@lfspm/core";
import { ClipboardClearService } from "@lfspm/core/services";
import { describe, expect, it, vi } from "vitest";
import { createChromeStorageArea } from "../../__tests__/fixtures/chrome-storage-area";
import {
  type WebLockManager,
  WebCryptoClipboardSecretHash,
  WebLocksClipboardOperationCoordinator,
} from "../../adapters/clipboard";
import { ChromeClipboardClearTaskRepository } from "../../adapters/storage";
import { CLIPBOARD_CLEAR_TASK_STORAGE_KEY } from "../../adapters/storage";
import {
  type ChromeAlarmsApi,
  ChromeAlarmsScheduledTask,
  InvalidScheduledTaskRecordError,
  serializeScheduledTask,
} from "../../adapters/system";
import {
  CLIPBOARD_CLEAR_RETRY_DELAY_MS,
  createClipboardAlarmHandler,
} from "./clipboard-alarm-runtime";

const immediateLockManager: WebLockManager = {
  request: async (_name, operation) => operation(null),
};

function createContext() {
  const clock = { now: vi.fn(() => 1_000) };
  const { storageArea } = createChromeStorageArea();
  const clipboardClearTasks = new ChromeClipboardClearTaskRepository(
    storageArea,
  );
  const clipboardOperations = new WebLocksClipboardOperationCoordinator(
    immediateLockManager,
  );
  const copyContextSecretHash = new WebCryptoClipboardSecretHash();
  const alarmContextSecretHash = new WebCryptoClipboardSecretHash();
  let clipboardValue = "copied-password";
  const clipboard: ClipboardPort = {
    readText: vi.fn(async () => clipboardValue),
    writeText: vi.fn(async (value) => {
      clipboardValue = value;
    }),
  };
  const createAlarm = vi.fn(async () => undefined);
  const clearAlarm = vi.fn(async () => true);
  const alarms: ChromeAlarmsApi = {
    create: createAlarm,
    clear: clearAlarm,
  };
  const scheduledTasks = new ChromeAlarmsScheduledTask(alarms);
  const clearClipboardTask = new ClearClipboardTaskUseCase(
    new ClipboardClearService(
      clipboard,
      clipboardClearTasks,
      clock,
      alarmContextSecretHash,
    ),
    clipboardOperations,
  );
  const handleAlarm = createClipboardAlarmHandler(
    clearClipboardTask,
    clipboardClearTasks,
    scheduledTasks,
    clock,
  );

  return {
    clock,
    clipboard,
    clipboardClearTasks,
    storageArea,
    clearAlarm,
    clearClipboardTask,
    createAlarm,
    getClipboardValue: () => clipboardValue,
    handleAlarm,
    copyContextSecretHash,
  };
}

describe("clipboard alarm runtime", () => {
  it("routes a Chrome alarm through coordinated volatile ownership cleanup", async () => {
    const ctx = createContext();
    const actionId = "clipboard-action-id";
    await ctx.clipboardClearTasks.save({
      actionId,
      copiedValueHash: await ctx.copyContextSecretHash.hashSecretValue(
        ctx.getClipboardValue(),
      ),
      expiresAt: ctx.clock.now(),
    });

    await ctx.handleAlarm({
      name: serializeScheduledTask({ name: "clearClipboard", actionId }),
    });

    expect(ctx.getClipboardValue()).toBe("");
    await expect(ctx.clipboardClearTasks.get()).resolves.toBeNull();
    expect(ctx.createAlarm).toHaveBeenCalledWith(
      serializeScheduledTask({ name: "clearClipboard", actionId }),
      { when: ctx.clock.now() + CLIPBOARD_CLEAR_RETRY_DELAY_MS },
    );
    expect(ctx.clearAlarm).toHaveBeenCalledWith(
      serializeScheduledTask({ name: "clearClipboard", actionId }),
    );
    expect(ctx.createAlarm.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(ctx.clipboard.readText).mock.invocationCallOrder[0]!,
    );
  });

  it("retains ownership and schedules a retry when clipboard access fails", async () => {
    const ctx = createContext();
    const actionId = "clipboard-action-id";
    const error = new Error("clipboard unavailable");
    await ctx.clipboardClearTasks.save({
      actionId,
      copiedValueHash: await ctx.copyContextSecretHash.hashSecretValue(
        ctx.getClipboardValue(),
      ),
      expiresAt: ctx.clock.now(),
    });
    vi.mocked(ctx.clipboard.readText).mockRejectedValueOnce(error);

    await expect(
      ctx.handleAlarm({
        name: serializeScheduledTask({ name: "clearClipboard", actionId }),
      }),
    ).rejects.toBe(error);

    await expect(ctx.clipboardClearTasks.get()).resolves.toMatchObject({
      actionId,
    });
    expect(ctx.createAlarm).toHaveBeenCalledWith(
      serializeScheduledTask({ name: "clearClipboard", actionId }),
      { when: ctx.clock.now() + CLIPBOARD_CLEAR_RETRY_DELAY_MS },
    );
    expect(ctx.clearAlarm).not.toHaveBeenCalled();
  });

  it("does not clear clipboard content that no longer matches ownership", async () => {
    const ctx = createContext();
    const actionId = "clipboard-action-id";
    await ctx.clipboardClearTasks.save({
      actionId,
      copiedValueHash: await ctx.copyContextSecretHash.hashSecretValue(
        ctx.getClipboardValue(),
      ),
      expiresAt: ctx.clock.now(),
    });
    vi.mocked(ctx.clipboard.readText).mockResolvedValueOnce("new clipboard");

    await ctx.handleAlarm({
      name: serializeScheduledTask({ name: "clearClipboard", actionId }),
    });

    expect(ctx.getClipboardValue()).toBe("copied-password");
    expect(ctx.clipboard.writeText).not.toHaveBeenCalled();
    await expect(ctx.clipboardClearTasks.get()).resolves.toBeNull();
    expect(ctx.clearAlarm).toHaveBeenCalledWith(
      serializeScheduledTask({ name: "clearClipboard", actionId }),
    );
  });

  it("retains changed clipboard ownership when metadata removal fails", async () => {
    const ctx = createContext();
    const actionId = "clipboard-action-id";
    const removalError = new Error("session storage unavailable");
    await ctx.clipboardClearTasks.save({
      actionId,
      copiedValueHash: await ctx.copyContextSecretHash.hashSecretValue(
        ctx.getClipboardValue(),
      ),
      expiresAt: ctx.clock.now(),
    });
    vi.mocked(ctx.clipboard.readText).mockResolvedValueOnce("new clipboard");
    vi.spyOn(ctx.storageArea, "remove").mockRejectedValueOnce(removalError);

    await expect(
      ctx.handleAlarm({
        name: serializeScheduledTask({ name: "clearClipboard", actionId }),
      }),
    ).rejects.toBe(removalError);

    expect(ctx.getClipboardValue()).toBe("copied-password");
    expect(ctx.clipboard.writeText).not.toHaveBeenCalled();
    await expect(ctx.clipboardClearTasks.get()).resolves.toMatchObject({
      actionId,
    });
    expect(ctx.clearAlarm).not.toHaveBeenCalled();
  });

  it("does not overwrite unverifiable clipboard content for a stale persisted alarm", async () => {
    const ctx = createContext();
    const actionId = "clipboard-action-id";

    await ctx.handleAlarm({
      name: serializeScheduledTask({ name: "clearClipboard", actionId }),
    });

    expect(ctx.getClipboardValue()).toBe("copied-password");
    expect(ctx.clipboard.readText).not.toHaveBeenCalled();
    expect(ctx.clipboard.writeText).not.toHaveBeenCalled();
    expect(ctx.createAlarm).not.toHaveBeenCalled();
    expect(ctx.clearAlarm).not.toHaveBeenCalled();
  });

  it("rejects malformed volatile ownership before alarm mutation", async () => {
    const ctx = createContext();
    const actionId = "clipboard-action-id";
    await ctx.storageArea.set({
      [CLIPBOARD_CLEAR_TASK_STORAGE_KEY]: {
        actionId,
        copiedValueHash: "invalid",
        expiresAt: ctx.clock.now(),
      },
    });

    await expect(
      ctx.handleAlarm({
        name: serializeScheduledTask({ name: "clearClipboard", actionId }),
      }),
    ).rejects.toBeInstanceOf(InvalidScheduledTaskRecordError);

    expect(ctx.getClipboardValue()).toBe("copied-password");
    expect(ctx.clipboard.readText).not.toHaveBeenCalled();
    expect(ctx.clipboard.writeText).not.toHaveBeenCalled();
    expect(ctx.createAlarm).not.toHaveBeenCalled();
    expect(ctx.clearAlarm).not.toHaveBeenCalled();
  });

  it("retries alarm creation when pre-arming and clipboard access both fail", async () => {
    const ctx = createContext();
    const actionId = "clipboard-action-id";
    const alarmError = new Error("alarms unavailable");
    await ctx.clipboardClearTasks.save({
      actionId,
      copiedValueHash: await ctx.copyContextSecretHash.hashSecretValue(
        ctx.getClipboardValue(),
      ),
      expiresAt: ctx.clock.now(),
    });
    ctx.createAlarm.mockRejectedValueOnce(alarmError);
    vi.mocked(ctx.clipboard.readText).mockRejectedValueOnce(
      new Error("clipboard unavailable"),
    );

    await expect(
      ctx.handleAlarm({
        name: serializeScheduledTask({ name: "clearClipboard", actionId }),
      }),
    ).rejects.toBe(alarmError);

    expect(ctx.createAlarm).toHaveBeenCalledTimes(2);
    await expect(ctx.clipboardClearTasks.get()).resolves.toMatchObject({
      actionId,
    });
  });

  it("keeps the pre-armed retry when an alarm fires before expiry", async () => {
    const ctx = createContext();
    const actionId = "clipboard-action-id";
    await ctx.clipboardClearTasks.save({
      actionId,
      copiedValueHash: await ctx.copyContextSecretHash.hashSecretValue(
        ctx.getClipboardValue(),
      ),
      expiresAt: ctx.clock.now() + 1_000,
    });

    await ctx.handleAlarm({
      name: serializeScheduledTask({ name: "clearClipboard", actionId }),
    });

    expect(ctx.createAlarm).toHaveBeenCalledWith(
      serializeScheduledTask({ name: "clearClipboard", actionId }),
      { when: ctx.clock.now() + CLIPBOARD_CLEAR_RETRY_DELAY_MS },
    );
    expect(ctx.clearAlarm).not.toHaveBeenCalled();
    expect(ctx.clipboard.readText).not.toHaveBeenCalled();
  });

  it("clears early when an alarm cannot be armed persistently", async () => {
    const ctx = createContext();
    const actionId = "clipboard-action-id";
    await ctx.clipboardClearTasks.save({
      actionId,
      copiedValueHash: await ctx.copyContextSecretHash.hashSecretValue(
        ctx.getClipboardValue(),
      ),
      expiresAt: ctx.clock.now() + 1_000,
    });
    ctx.createAlarm.mockRejectedValue(new Error("alarms unavailable"));

    await ctx.handleAlarm({
      name: serializeScheduledTask({ name: "clearClipboard", actionId }),
    });

    expect(ctx.createAlarm).toHaveBeenCalledTimes(2);
    expect(ctx.getClipboardValue()).toBe("");
    await expect(ctx.clipboardClearTasks.get()).resolves.toBeNull();
  });

  it("ignores unrelated and vault-lock alarms", async () => {
    const ctx = createContext();

    await ctx.handleAlarm({ name: "unrelated" });
    await ctx.handleAlarm({
      name: serializeScheduledTask({
        name: "lockVault",
        actionId: "lock-action-id",
      }),
    });

    expect(ctx.clipboard.readText).not.toHaveBeenCalled();
    expect(ctx.createAlarm).not.toHaveBeenCalled();
    expect(ctx.clearAlarm).not.toHaveBeenCalled();
  });

  it("preserves the active clipboard task for a mismatched alarm action", async () => {
    const ctx = createContext();
    await ctx.clipboardClearTasks.save({
      actionId: "active-action-id",
      copiedValueHash: await ctx.copyContextSecretHash.hashSecretValue(
        ctx.getClipboardValue(),
      ),
      expiresAt: ctx.clock.now(),
    });

    await ctx.handleAlarm({
      name: serializeScheduledTask({
        name: "clearClipboard",
        actionId: "stale-action-id",
      }),
    });

    expect(ctx.clipboard.readText).not.toHaveBeenCalled();
    expect(ctx.clipboard.writeText).not.toHaveBeenCalled();
    await expect(ctx.clipboardClearTasks.get()).resolves.toMatchObject({
      actionId: "active-action-id",
    });
    expect(ctx.createAlarm).not.toHaveBeenCalled();
    expect(ctx.clearAlarm).not.toHaveBeenCalled();
  });

  it("cancels only the retry it pre-armed when ownership races to stale", async () => {
    const ctx = createContext();
    const actionId = "clipboard-action-id";
    await ctx.clipboardClearTasks.save({
      actionId,
      copiedValueHash: await ctx.copyContextSecretHash.hashSecretValue(
        ctx.getClipboardValue(),
      ),
      expiresAt: ctx.clock.now(),
    });
    vi.spyOn(ctx.clearClipboardTask, "execute").mockResolvedValueOnce({
      cleared: false,
      reason: "staleAction",
    });

    await ctx.handleAlarm({
      name: serializeScheduledTask({ name: "clearClipboard", actionId }),
    });

    expect(ctx.createAlarm).toHaveBeenCalledOnce();
    expect(ctx.clearAlarm).toHaveBeenCalledWith(
      serializeScheduledTask({ name: "clearClipboard", actionId }),
    );
    expect(ctx.clipboard.readText).not.toHaveBeenCalled();
    expect(ctx.clipboard.writeText).not.toHaveBeenCalled();
    await expect(ctx.clipboardClearTasks.get()).resolves.toMatchObject({
      actionId,
    });
  });
});
