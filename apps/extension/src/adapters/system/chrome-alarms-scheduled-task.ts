import type { ScheduledTask, ScheduledTaskPort } from "@lfspm/core";
import {
  decodeScheduledTaskAlarmName,
  encodeScheduledTaskAlarmName,
} from "./scheduled-task-record.codec";

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
  return encodeScheduledTaskAlarmName(task);
}

export function parseScheduledTask(alarmName: string): ScheduledTask | null {
  return decodeScheduledTaskAlarmName(alarmName);
}
