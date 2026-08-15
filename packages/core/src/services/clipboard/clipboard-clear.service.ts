import type {
  ClipboardClearTask,
  ClipboardClearTaskRepositoryPort,
} from "../../ports/clipboard/clipboard-clear-task-repository.port";
import type { ClipboardPort } from "../../ports/clipboard/clipboard.port";
import type { ClipboardSecretHashPort } from "../../ports/clipboard/clipboard-secret-hash.port";
import type { ClockPort } from "../../ports/system/clock.port";

export class ClipboardClearService {
  private readonly clipboard: ClipboardPort;
  private readonly clipboardClearTasks: ClipboardClearTaskRepositoryPort;
  private readonly clock: ClockPort;
  private readonly secretHash: ClipboardSecretHashPort;

  constructor(
    clipboard: ClipboardPort,
    clipboardClearTasks: ClipboardClearTaskRepositoryPort,
    clock: ClockPort,
    secretHash: ClipboardSecretHashPort,
  ) {
    this.clipboard = clipboard;
    this.clipboardClearTasks = clipboardClearTasks;
    this.clock = clock;
    this.secretHash = secretHash;
  }

  async clearTask(params: {
    readonly actionId?: string;
    readonly requireExpired: boolean;
    readonly task?: ClipboardClearTask | null;
  }): Promise<
    | {
        readonly cleared: true;
      }
    | {
        readonly cleared: false;
        readonly reason:
          | "clipboardChanged"
          | "noClipboardClearTask"
          | "notExpired"
          | "staleAction";
      }
  > {
    const task =
      "task" in params
        ? (params.task ?? null)
        : await this.clipboardClearTasks.get();

    if (task === null) {
      return {
        cleared: false,
        reason: "noClipboardClearTask",
      };
    }

    if (params.actionId !== undefined && task.actionId !== params.actionId) {
      return {
        cleared: false,
        reason: "staleAction",
      };
    }

    if (params.requireExpired && this.clock.now() < task.expiresAt) {
      return {
        cleared: false,
        reason: "notExpired",
      };
    }

    const currentClipboardValue = await this.clipboard.readText();
    const currentClipboardValueHash = await this.secretHash.hashSecretValue(
      currentClipboardValue,
    );

    const isCopiedValueStillPresent =
      await this.secretHash.compareSecretValueHash(
        currentClipboardValueHash,
        task.copiedValueHash,
      );

    if (!isCopiedValueStillPresent) {
      await this.clipboardClearTasks.remove();

      return {
        cleared: false,
        reason: "clipboardChanged",
      };
    }

    await this.clipboard.writeText("");
    await this.clipboardClearTasks.remove();

    return {
      cleared: true,
    };
  }
}
