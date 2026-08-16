import type {
  ClipboardClearTaskRepositoryPort,
  ClockPort,
  IdPort,
  ScheduledTaskPort,
} from "@lfspm/core";
import { ClearClipboardTaskUseCase, LockVaultUseCase } from "@lfspm/core";
import {
  ClipboardClearService,
  UnlockedVaultSessionService,
  VaultLifecycleCleanupService,
} from "@lfspm/core/services";
import {
  OffscreenClipboard,
  WebCryptoClipboardSecretHash,
  WebLocksClipboardOperationCoordinator,
} from "../../adapters/clipboard";
import { WebCryptoPort } from "../../adapters/crypto";
import {
  ChromeClipboardClearTaskRepository,
  ChromeUnlockedVaultSessionMaterialRepository,
  ChromeVaultLockTaskRepository,
  IndexedDbEncryptedUnlockedVaultSessionPayloadRepository,
} from "../../adapters/storage";
import {
  ChromeAlarmsScheduledTask,
  parseScheduledTask,
} from "../../adapters/system";

export const CLIPBOARD_CLEAR_RETRY_DELAY_MS = 60_000;

type ClearClipboardTaskExecutor = Pick<ClearClipboardTaskUseCase, "execute">;
type LockVaultTaskExecutor = Pick<LockVaultUseCase, "execute">;
type ClipboardAlarmHandler = (alarm: {
  readonly name: string;
}) => Promise<void>;

export function createClipboardAlarmHandler(
  clearClipboardTask: ClearClipboardTaskExecutor,
  clipboardClearTasks: Pick<ClipboardClearTaskRepositoryPort, "get">,
  scheduledTasks: ScheduledTaskPort,
  clock: ClockPort,
): ClipboardAlarmHandler {
  return async (alarm) => {
    const task = parseScheduledTask(alarm.name);

    if (task?.name !== "clearClipboard") {
      return;
    }

    const activeTask = await clipboardClearTasks.get();
    if (activeTask === null || activeTask.actionId !== task.actionId) {
      return;
    }

    const retry = {
      task,
      runAt: clock.now() + CLIPBOARD_CLEAR_RETRY_DELAY_MS,
    };
    let retryScheduleError: unknown;
    let retryScheduled = false;

    try {
      await scheduledTasks.scheduleTask(retry);
      retryScheduled = true;
    } catch (error) {
      retryScheduleError = error;
    }

    const executeClear = (requireExpired: boolean) =>
      clearClipboardTask.execute({
        actionId: task.actionId,
        requireExpired,
      });
    let result: Awaited<ReturnType<ClearClipboardTaskExecutor["execute"]>>;

    try {
      result = await executeClear(true);
    } catch (error) {
      if (!retryScheduled) {
        try {
          await scheduledTasks.scheduleTask(retry);
        } catch {
          // Preserve the first alarm scheduling or clipboard failure.
        }
      }

      throw retryScheduleError ?? error;
    }

    if (!result.cleared && result.reason === "notExpired") {
      if (!retryScheduled) {
        try {
          await scheduledTasks.scheduleTask(retry);
        } catch {
          try {
            await executeClear(false);
          } catch (error) {
            throw retryScheduleError ?? error;
          }
        }
      }

      return;
    }

    if (!result.cleared && result.reason === "staleAction") {
      if (retryScheduled) {
        await scheduledTasks.cancelTask(task);
      }

      return;
    }

    if (retryScheduled) {
      await scheduledTasks.cancelTask(task);
    }
  };
}

export function createVaultLockAlarmHandler(
  lockVault: LockVaultTaskExecutor,
): ClipboardAlarmHandler {
  return async (alarm) => {
    const task = parseScheduledTask(alarm.name);

    if (task?.name !== "lockVault") {
      return;
    }

    await lockVault.execute({ actionId: task.actionId });
  };
}

export function composeClipboardAlarmHandler(): ClipboardAlarmHandler {
  const clock: ClockPort = { now: () => Date.now() };
  const clipboard = new OffscreenClipboard();
  const clipboardClearTasks = new ChromeClipboardClearTaskRepository();
  const clipboardOperations = new WebLocksClipboardOperationCoordinator();
  const scheduledTasks = new ChromeAlarmsScheduledTask();
  const clipboardClear = new ClipboardClearService(
    clipboard,
    clipboardClearTasks,
    clock,
    new WebCryptoClipboardSecretHash(),
  );
  const clearClipboardTask = new ClearClipboardTaskUseCase(
    clipboardClear,
    clipboardOperations,
  );

  return createClipboardAlarmHandler(
    clearClipboardTask,
    clipboardClearTasks,
    scheduledTasks,
    clock,
  );
}

export function composeScheduledTaskAlarmHandler(): ClipboardAlarmHandler {
  const clock: ClockPort = { now: () => Date.now() };
  const ids: IdPort = {
    generateId: async () => globalThis.crypto.randomUUID(),
  };
  const clipboard = new OffscreenClipboard();
  const clipboardClearTasks = new ChromeClipboardClearTaskRepository();
  const clipboardOperations = new WebLocksClipboardOperationCoordinator();
  const scheduledTasks = new ChromeAlarmsScheduledTask();
  const vaultLockTasks = new ChromeVaultLockTaskRepository();
  const clipboardClear = new ClipboardClearService(
    clipboard,
    clipboardClearTasks,
    clock,
    new WebCryptoClipboardSecretHash(),
  );
  const unlockedVaultSession = new UnlockedVaultSessionService(
    new ChromeUnlockedVaultSessionMaterialRepository(),
    new IndexedDbEncryptedUnlockedVaultSessionPayloadRepository(),
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
  const clearClipboardAlarm = createClipboardAlarmHandler(
    new ClearClipboardTaskUseCase(clipboardClear, clipboardOperations),
    clipboardClearTasks,
    scheduledTasks,
    clock,
  );
  const lockVaultAlarm = createVaultLockAlarmHandler(
    new LockVaultUseCase(lifecycleCleanup),
  );

  return async (alarm) => {
    await clearClipboardAlarm(alarm);
    await lockVaultAlarm(alarm);
  };
}
