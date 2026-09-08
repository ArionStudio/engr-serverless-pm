import type { ClipboardPort } from "@lfspm/core";

export type NavigatorClipboardApi = Pick<Clipboard, "readText" | "writeText">;

/**
 * Firefox background scripts run in an extension document and can use the
 * Clipboard API when clipboardRead and clipboardWrite are granted.
 */
export class NavigatorClipboardAdapter implements ClipboardPort {
  private readonly clipboard: NavigatorClipboardApi;

  constructor(clipboard: NavigatorClipboardApi) {
    this.clipboard = clipboard;
  }

  readText(): Promise<string> {
    return this.clipboard.readText();
  }

  writeText(value: string): Promise<void> {
    return this.clipboard.writeText(value);
  }
}
