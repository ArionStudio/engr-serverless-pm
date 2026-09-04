import type {
  ClipboardClearTaskRepositoryPort,
  ClockPort,
  ScheduledTaskPort,
  VaultLockTaskRepositoryPort,
} from "@lfspm/core";
import { ClearClipboardTaskUseCase, LockVaultUseCase } from "@lfspm/core";
import {
  ClipboardClearService,
  UnlockedVaultSessionService,
  VaultLifecycleCleanupService,
} from "@lfspm/core/services";
import {
  OffscreenClipboardAdapter,
  WebCryptoClipboardSecretHashAdapter,
  WebLocksClipboardOperationCoordinatorAdapter,
} from "../../adapters/clipboard";
import { WebCryptoAdapter } from "../../adapters/crypto/web-crypto.adapter";
import {
  ChromeClipboardClearTaskRepositoryAdapter,
  ChromeUnlockedVaultSessionMaterialRepositoryAdapter,
  ChromeVaultLockTaskRepositoryAdapter,
  IndexedDbEncryptedUnlockedVaultSessionPayloadRepositoryAdapter,
} from "../../adapters/storage";
import {
  ChromeAlarmsScheduledTaskAdapter,
  parseScheduledTask,
  SystemClockAdapter,
  WebCryptoIdAdapter,
} from "../../adapters/system";

export const CLIPBOARD_CLEAR_RETRY_DELAY_MS = 60_000;
export const VAULT_LOCK_RETRY_DELAY_MS = 60_000;

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
  vaultLockTasks: Pick<VaultLockTaskRepositoryPort, "get">,
  scheduledTasks: ScheduledTaskPort,
  clock: ClockPort,
): ClipboardAlarmHandler {
  return async (alarm) => {
    const task = parseScheduledTask(alarm.name);

    if (task?.name !== "lockVault") {
      return;
    }

    const retry = {
      task,
      runAt: clock.now() + VAULT_LOCK_RETRY_DELAY_MS,
    };
    let activeTask: Awaited<ReturnType<VaultLockTaskRepositoryPort["get"]>>;

    try {
      activeTask = await vaultLockTasks.get();
    } catch (error) {
      try {
        await scheduledTasks.scheduleTask(retry);
      } catch {
        // Preserve the ownership-read failure that prevented authentication.
      }

      throw error;
    }

    if (activeTask === null || activeTask.actionId !== task.actionId) {
      return;
    }

    let retryScheduleError: unknown;
    let retryScheduled = false;

    try {
      await scheduledTasks.scheduleTask(retry);
      retryScheduled = true;
    } catch (error) {
      retryScheduleError = error;
    }

    try {
      await lockVault.execute({ actionId: task.actionId });
    } catch (error) {
      if (!retryScheduled) {
        try {
          await scheduledTasks.scheduleTask(retry);
        } catch {
          // Preserve the first alarm scheduling or vault cleanup failure.
        }
      }

      throw retryScheduleError ?? error;
    }

    if (retryScheduled) {
      await scheduledTasks.cancelTask(task);
    }
  };
}

export function composeClipboardAlarmHandler(): ClipboardAlarmHandler {
  const clock = new SystemClockAdapter();
  const clipboard = new OffscreenClipboardAdapter();
  const clipboardClearTasks = new ChromeClipboardClearTaskRepositoryAdapter();
  const clipboardOperations =
    new WebLocksClipboardOperationCoordinatorAdapter();
  const scheduledTasks = new ChromeAlarmsScheduledTaskAdapter();
  const clipboardClear = new ClipboardClearService(
    clipboard,
    clipboardClearTasks,
    clock,
    new WebCryptoClipboardSecretHashAdapter(),
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
  const clock = new SystemClockAdapter();
  const ids = new WebCryptoIdAdapter();
  const clipboard = new OffscreenClipboardAdapter();
  const clipboardClearTasks = new ChromeClipboardClearTaskRepositoryAdapter();
  const clipboardOperations =
    new WebLocksClipboardOperationCoordinatorAdapter();
  const scheduledTasks = new ChromeAlarmsScheduledTaskAdapter();
  const vaultLockTasks = new ChromeVaultLockTaskRepositoryAdapter();
  const clipboardClear = new ClipboardClearService(
    clipboard,
    clipboardClearTasks,
    clock,
    new WebCryptoClipboardSecretHashAdapter(),
  );
  const unlockedVaultSession = new UnlockedVaultSessionService(
    new ChromeUnlockedVaultSessionMaterialRepositoryAdapter(),
    new IndexedDbEncryptedUnlockedVaultSessionPayloadRepositoryAdapter(),
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
  const clearClipboardAlarm = createClipboardAlarmHandler(
    new ClearClipboardTaskUseCase(clipboardClear, clipboardOperations),
    clipboardClearTasks,
    scheduledTasks,
    clock,
  );
  const lockVaultAlarm = createVaultLockAlarmHandler(
    new LockVaultUseCase(lifecycleCleanup),
    vaultLockTasks,
    scheduledTasks,
    clock,
  );

  return async (alarm) => {
    await clearClipboardAlarm(alarm);
    await lockVaultAlarm(alarm);
  };
}
