import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OFFSCREEN_CLIPBOARD_DOCUMENT_PATH,
  OFFSCREEN_CLIPBOARD_MESSAGE_TARGET,
  OFFSCREEN_CLIPBOARD_RESPONSE_TIMEOUT_MS,
} from "../../adapters/clipboard/offscreen-clipboard";

class FakeTextAreaElement {
  value = "";
  readonly focus = vi.fn();
  readonly select = vi.fn();
}

type RuntimeMessageListener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
) => boolean | undefined;

describe("offscreen clipboard bridge", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("routes a service-worker clipboard request through the production listener", async () => {
    const transferControl = new FakeTextAreaElement();
    let copyListener: ((event: ClipboardEvent) => void) | undefined;
    const addDocumentEventListener = vi.fn(
      (_type: "copy", listener: (event: ClipboardEvent) => void) => {
        copyListener = listener;
      },
    );
    const removeDocumentEventListener = vi.fn();
    const execCommand = vi.fn(() => {
      copyListener?.({
        clipboardData: { setData: vi.fn() },
        preventDefault: vi.fn(),
      } as unknown as ClipboardEvent);
      return true;
    });
    let offscreenListener: RuntimeMessageListener | undefined;
    const addListener = vi.fn((listener: RuntimeMessageListener) => {
      offscreenListener = listener;
    });
    const documentUrl = `chrome-extension://extension-id/${OFFSCREEN_CLIPBOARD_DOCUMENT_PATH}`;
    const sendMessage = vi.fn(
      (message: unknown) =>
        new Promise<unknown>((resolve, reject) => {
          if (offscreenListener === undefined) {
            reject(new Error("Offscreen listener is unavailable."));
            return;
          }

          offscreenListener(
            message,
            { id: "extension-id" } as chrome.runtime.MessageSender,
            resolve,
          );
        }),
    );
    const getContexts = vi.fn(async () => [
      { contextType: "OFFSCREEN_DOCUMENT" },
    ]);

    vi.stubGlobal("HTMLTextAreaElement", FakeTextAreaElement);
    vi.stubGlobal("document", {
      addEventListener: addDocumentEventListener,
      getElementById: vi.fn(() => transferControl),
      execCommand,
      removeEventListener: removeDocumentEventListener,
    });
    vi.stubGlobal("chrome", {
      offscreen: { createDocument: vi.fn(async () => undefined) },
      runtime: {
        getContexts,
        getURL: vi.fn(() => documentUrl),
        onMessage: { addListener },
        sendMessage,
      },
    });

    await import("./offscreen");
    const { OffscreenClipboard } =
      await import("../../adapters/clipboard/offscreen-clipboard");
    const clipboard = new OffscreenClipboard();

    await expect(clipboard.writeText("bridge-value")).resolves.toBeUndefined();

    expect(addListener).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledWith({
      target: OFFSCREEN_CLIPBOARD_MESSAGE_TARGET,
      operation: "write",
      value: "bridge-value",
      deadlineEpochMs: expect.any(Number),
    });
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(addDocumentEventListener).toHaveBeenCalledOnce();
    expect(removeDocumentEventListener).toHaveBeenCalledOnce();
    expect(transferControl.value).toBe("");
  });

  it("does not write when delivery occurs after the request deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-20T12:00:00.000Z"));

    try {
      const transferControl = new FakeTextAreaElement();
      const addDocumentEventListener = vi.fn();
      const removeDocumentEventListener = vi.fn();
      const execCommand = vi.fn(() => true);
      let offscreenListener: RuntimeMessageListener | undefined;
      const addListener = vi.fn((listener: RuntimeMessageListener) => {
        offscreenListener = listener;
      });
      const documentUrl = `chrome-extension://extension-id/${OFFSCREEN_CLIPBOARD_DOCUMENT_PATH}`;
      let delayedMessage: unknown;
      const sendMessage = vi.fn((message: unknown) => {
        delayedMessage = message;
        return new Promise<unknown>(() => undefined);
      });

      vi.stubGlobal("HTMLTextAreaElement", FakeTextAreaElement);
      vi.stubGlobal("document", {
        addEventListener: addDocumentEventListener,
        getElementById: vi.fn(() => transferControl),
        execCommand,
        removeEventListener: removeDocumentEventListener,
      });
      vi.stubGlobal("chrome", {
        offscreen: { createDocument: vi.fn(async () => undefined) },
        runtime: {
          getContexts: vi.fn(async () => [
            { contextType: "OFFSCREEN_DOCUMENT" },
          ]),
          getURL: vi.fn(() => documentUrl),
          onMessage: { addListener },
          sendMessage,
        },
      });

      await import("./offscreen");
      const { OffscreenClipboard } =
        await import("../../adapters/clipboard/offscreen-clipboard");
      const clipboard = new OffscreenClipboard();
      const pendingWrite = expect(
        clipboard.writeText("expired-value"),
      ).rejects.toThrow("Offscreen clipboard response timed out.");

      await vi.advanceTimersByTimeAsync(
        OFFSCREEN_CLIPBOARD_RESPONSE_TIMEOUT_MS,
      );
      await pendingWrite;

      const sendResponse = vi.fn();
      offscreenListener?.(
        delayedMessage,
        { id: "extension-id" } as chrome.runtime.MessageSender,
        sendResponse,
      );

      expect(sendResponse).toHaveBeenCalledWith({
        ok: false,
        error: "Clipboard request expired.",
      });
      expect(execCommand).not.toHaveBeenCalled();
      expect(addDocumentEventListener).not.toHaveBeenCalled();
      expect(transferControl.value).toBe("");
    } finally {
      vi.useRealTimers();
    }
  });
});
