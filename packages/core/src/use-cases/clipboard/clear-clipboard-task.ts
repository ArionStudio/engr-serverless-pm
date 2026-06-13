import type { ClipboardClearTask } from "../../ports/clipboard/clipboard-clear-task-repository.port";
import type { ClipboardClearService } from "../../services/clipboard/clipboard-clear.service";

export type ClearClipboardTaskCommandParams = {
  readonly actionId?: string;
  readonly requireExpired: boolean;
  readonly task?: ClipboardClearTask | null;
};

export type ClearClipboardTaskResult =
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
    };

export class ClearClipboardTaskUseCase {
  private readonly clipboardClear: ClipboardClearService;

  constructor(clipboardClear: ClipboardClearService) {
    this.clipboardClear = clipboardClear;
  }

  async execute(
    params: ClearClipboardTaskCommandParams,
  ): Promise<ClearClipboardTaskResult> {
    return this.clipboardClear.clearTask(params);
  }
}
