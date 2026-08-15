import type { ClockPort, ScheduledTaskPort } from "@lfspm/core";
import { ClearClipboardTaskUseCase } from "@lfspm/core";
import { ClipboardClearService } from "@lfspm/core/services";
import {
  OffscreenClipboard,
  WebCryptoClipboardSecretHash,
  WebLocksClipboardOperationCoordinator,
} from "../../adapters/clipboard";
import { ChromeClipboardClearTaskRepository } from "../../adapters/storage";
import {
  ChromeAlarmsScheduledTask,
  parseScheduledTask,
} from "../../adapters/system";

export const CLIPBOARD_CLEAR_RETRY_DELAY_MS = 60_000;

type ClearClipboardTaskExecutor = Pick<ClearClipboardTaskUseCase, "execute">;
type ClipboardAlarmHandler = (alarm: {
  readonly name: string;
}) => Promise<void>;

export function createClipboardAlarmHandler(
  clearClipboardTask: ClearClipboardTaskExecutor,
  scheduledTasks: ScheduledTaskPort,
  clock: ClockPort,
): ClipboardAlarmHandler {
  return async (alarm) => {
    const task = parseScheduledTask(alarm.name);

    if (task?.name !== "clearClipboard") {
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

    if (retryScheduled) {
      await scheduledTasks.cancelTask(task);
    }
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

  return createClipboardAlarmHandler(clearClipboardTask, scheduledTasks, clock);
}
