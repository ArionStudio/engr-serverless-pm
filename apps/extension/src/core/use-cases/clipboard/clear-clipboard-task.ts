import type { ClipboardClearTask } from "../../ports/clipboard-clear-task-repository.port";
import type { ClipboardClearTaskRepositoryPort } from "../../ports/clipboard-clear-task-repository.port";
import type { ClipboardPort } from "../../ports/clipboard.port";
import type { ClockPort } from "../../ports/clock.port";
import type { CryptoPort } from "../../ports/crypto.port";

export type ClearClipboardTaskCommandParams = {
  actionId?: string;
  requireExpired: boolean;
  task?: ClipboardClearTask | null;
};

export type ClearClipboardTaskResult =
  | {
      cleared: true;
    }
  | {
      cleared: false;
      reason:
        | "clipboardChanged"
        | "noClipboardClearTask"
        | "notExpired"
        | "staleAction";
    };

export class ClearClipboardTaskUseCase {
  private readonly clipboard: ClipboardPort;
  private readonly clipboardClearTasks: ClipboardClearTaskRepositoryPort;
  private readonly clock: ClockPort;
  private readonly crypto: CryptoPort;

  constructor(
    clipboard: ClipboardPort,
    clipboardClearTasks: ClipboardClearTaskRepositoryPort,
    clock: ClockPort,
    crypto: CryptoPort,
  ) {
    this.clipboard = clipboard;
    this.clipboardClearTasks = clipboardClearTasks;
    this.clock = clock;
    this.crypto = crypto;
  }

  async execute(
    params: ClearClipboardTaskCommandParams,
  ): Promise<ClearClipboardTaskResult> {
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
    const currentClipboardValueHash = await this.crypto.hashSecretValue(
      currentClipboardValue,
    );

    if (currentClipboardValueHash !== task.copiedValueHash) {
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
