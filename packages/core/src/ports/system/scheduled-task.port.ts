import type { ScheduledTask } from "../../domain/scheduled-task/scheduled-task.type";

export interface ScheduledTaskPort {
  scheduleTask: (params: {
    readonly task: ScheduledTask;
    readonly runAt: number;
  }) => Promise<void>;
  cancelTask: (task: ScheduledTask) => Promise<void>;
}
