export class InvalidClipboardClearDelayError extends Error {
  constructor(cause: unknown) {
    super("Clipboard clear delay is invalid.", { cause });
    this.name = "InvalidClipboardClearDelayError";
  }
}
