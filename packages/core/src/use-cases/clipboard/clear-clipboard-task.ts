import type { ClipboardOperationCoordinatorPort } from "../../ports/clipboard/clipboard-operation-coordinator.port";
import type { ClipboardClearService } from "../../services/clipboard/clipboard-clear.service";

export type ClearClipboardTaskCommandParams = {
  readonly actionId?: string;
  readonly requireExpired: boolean;
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
  private readonly clipboardOperations: ClipboardOperationCoordinatorPort;

  constructor(
    clipboardClear: ClipboardClearService,
    clipboardOperations: ClipboardOperationCoordinatorPort,
  ) {
    this.clipboardClear = clipboardClear;
    this.clipboardOperations = clipboardOperations;
  }

  async execute(
    params: ClearClipboardTaskCommandParams,
  ): Promise<ClearClipboardTaskResult> {
    return this.clipboardOperations.runExclusive(() =>
      this.clipboardClear.clearTask(params),
    );
  }
}
