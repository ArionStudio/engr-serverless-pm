import type {
  ClearClipboardTaskParams,
  ClearClipboardTaskResult,
  ClipboardClearService,
} from "../../services/clipboard/clipboard-clear.service";

export type ClearClipboardTaskCommandParams = ClearClipboardTaskParams;
export type { ClearClipboardTaskResult };

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
