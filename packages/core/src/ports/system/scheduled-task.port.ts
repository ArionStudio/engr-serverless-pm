import type { ScheduledTask } from "../../domain/scheduled-task/scheduled-task.type";

export type ScheduleTaskParams<TTask extends ScheduledTask = ScheduledTask> = {
  task: TTask;
  runAt: number;
};

export interface ScheduledTaskPort {
  scheduleTask: (params: ScheduleTaskParams) => Promise<void>;
  cancelTask: (task: ScheduledTask) => Promise<void>;
}
