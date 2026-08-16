import type { ScheduledTask, ScheduledTaskPort } from "@lfspm/core";

export const SCHEDULED_TASK_ALARM_PREFIX = "lfspm:scheduled-task:";

export type ChromeAlarmsApi = {
  create: (
    name: string,
    alarmInfo: { readonly when: number },
  ) => void | Promise<void>;
  clear: (name: string) => boolean | Promise<boolean>;
};

export class ChromeAlarmsScheduledTask implements ScheduledTaskPort {
  private readonly alarms: ChromeAlarmsApi;

  constructor(alarms: ChromeAlarmsApi = chrome.alarms) {
    this.alarms = alarms;
  }

  async scheduleTask(params: {
    readonly task: ScheduledTask;
    readonly runAt: number;
  }): Promise<void> {
    await this.alarms.create(serializeScheduledTask(params.task), {
      when: params.runAt,
    });
  }

  async cancelTask(task: ScheduledTask): Promise<void> {
    await this.alarms.clear(serializeScheduledTask(task));
  }
}

export function serializeScheduledTask(task: ScheduledTask): string {
  return `${SCHEDULED_TASK_ALARM_PREFIX}${task.name}:${encodeURIComponent(task.actionId)}`;
}

export function parseScheduledTask(alarmName: string): ScheduledTask | null {
  if (!alarmName.startsWith(SCHEDULED_TASK_ALARM_PREFIX)) {
    return null;
  }

  const serializedTask = alarmName.slice(SCHEDULED_TASK_ALARM_PREFIX.length);
  const separatorIndex = serializedTask.indexOf(":");

  if (separatorIndex < 1) {
    return null;
  }

  const name = serializedTask.slice(0, separatorIndex);
  const encodedActionId = serializedTask.slice(separatorIndex + 1);

  if (
    (name !== "clearClipboard" && name !== "lockVault") ||
    encodedActionId.length === 0
  ) {
    return null;
  }

  try {
    const actionId = decodeURIComponent(encodedActionId);

    if (actionId.trim().length === 0) {
      return null;
    }

    return {
      name,
      actionId,
    };
  } catch {
    return null;
  }
}
