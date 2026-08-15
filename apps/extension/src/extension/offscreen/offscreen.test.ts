import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OFFSCREEN_CLIPBOARD_DOCUMENT_PATH,
  OFFSCREEN_CLIPBOARD_MESSAGE_TARGET,
} from "../../adapters/clipboard/offscreen-clipboard";

class FakeTextAreaElement {
  value = "";
  readonly focus = vi.fn();
  readonly select = vi.fn();
}

describe("offscreen clipboard bridge", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("routes a service-worker clipboard request through the production listener", async () => {
    const transferControl = new FakeTextAreaElement();
    const execCommand = vi.fn(() => true);
    let offscreenListener: ((event: MessageEvent) => void) | undefined;
    let responsePort: MessagePort | undefined;
    const addEventListener = vi.fn(
      (eventName: string, listener: (event: MessageEvent) => void) => {
        expect(eventName).toBe("message");
        offscreenListener = listener;
      },
    );
    const documentUrl = `chrome-extension://extension-id/${OFFSCREEN_CLIPBOARD_DOCUMENT_PATH}`;
    const clientPostMessage = vi.fn(
      (message: unknown, transfer: Transferable[]) => {
        const transferredPort = transfer[0];

        if (!(transferredPort instanceof MessagePort)) {
          throw new Error("Expected an offscreen response port.");
        }

        responsePort = transferredPort;
        offscreenListener?.({
          data: message,
          ports: [transferredPort],
        } as unknown as MessageEvent);
      },
    );
    const matchAll = vi.fn(async () => [
      { url: documentUrl, postMessage: clientPostMessage },
    ]);
    const getContexts = vi.fn(async () => [
      { contextType: "OFFSCREEN_DOCUMENT" },
    ]);

    vi.stubGlobal("HTMLTextAreaElement", FakeTextAreaElement);
    vi.stubGlobal("document", {
      getElementById: vi.fn(() => transferControl),
      execCommand,
    });
    vi.stubGlobal("navigator", {
      serviceWorker: { addEventListener },
    });
    vi.stubGlobal("clients", { matchAll });
    vi.stubGlobal("chrome", {
      offscreen: { createDocument: vi.fn(async () => undefined) },
      runtime: {
        getContexts,
        getURL: vi.fn(() => documentUrl),
      },
    });

    await import("./offscreen");
    const { OffscreenClipboard } =
      await import("../../adapters/clipboard/offscreen-clipboard");
    const clipboard = new OffscreenClipboard();

    await expect(clipboard.writeText("bridge-value")).resolves.toBeUndefined();

    expect(addEventListener).toHaveBeenCalledOnce();
    expect(matchAll).toHaveBeenCalledWith({
      includeUncontrolled: true,
      type: "window",
    });
    expect(clientPostMessage).toHaveBeenCalledWith(
      {
        target: OFFSCREEN_CLIPBOARD_MESSAGE_TARGET,
        operation: "write",
        value: "bridge-value",
      },
      [expect.any(MessagePort)],
    );
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(transferControl.value).toBe("");

    responsePort?.close();
  });
});
