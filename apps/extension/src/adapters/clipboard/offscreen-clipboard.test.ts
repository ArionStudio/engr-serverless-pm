import { describe, expect, it, vi } from "vitest";
import {
  type ChromeOffscreenApi,
  type ChromeRuntimeMessenger,
  type OffscreenClipboardResponse,
  type OffscreenClientDirectory,
  OFFSCREEN_CLIPBOARD_MESSAGE_TARGET,
  OFFSCREEN_CLIPBOARD_REASON,
  OFFSCREEN_CLIPBOARD_RESPONSE_TIMEOUT_MS,
  OFFSCREEN_DOCUMENT_CONTEXT,
  OffscreenClipboard,
} from "./offscreen-clipboard";

function createContext(documentExists = false) {
  const createDocument = vi.fn(async () => undefined);
  const offscreen: ChromeOffscreenApi = {
    createDocument,
  };
  let nextResponse: OffscreenClipboardResponse | undefined;
  let respond = true;
  const postMessage = vi.fn(
    (request: { readonly operation?: unknown }, transfer: Transferable[]) => {
      const responsePort = transfer[0];

      if (!(responsePort instanceof MessagePort)) {
        throw new Error("Expected a response message port.");
      }

      if (!respond) {
        return;
      }

      responsePort.postMessage(
        nextResponse ??
          (request.operation === "read"
            ? { ok: true, value: "clipboard-value" }
            : { ok: true }),
      );
      nextResponse = undefined;
    },
  );
  const otherClientPostMessage = vi.fn();
  const documentUrl = "chrome-extension://extension-id/offscreen.html";
  const matchAll = vi.fn(async () => [
    {
      url: "chrome-extension://extension-id/options.html",
      postMessage: otherClientPostMessage,
    },
    { url: documentUrl, postMessage },
  ]);
  const clients: OffscreenClientDirectory = { matchAll };
  const getContexts = vi.fn(async () =>
    documentExists ? [{ contextType: OFFSCREEN_DOCUMENT_CONTEXT }] : [],
  );
  const runtime: ChromeRuntimeMessenger = { getContexts };
  const clipboard = new OffscreenClipboard(
    offscreen,
    runtime,
    documentUrl,
    clients,
  );

  return {
    clipboard,
    createDocument,
    getContexts,
    matchAll,
    otherClientPostMessage,
    postMessage,
    setNextResponse(response: OffscreenClipboardResponse) {
      nextResponse = response;
    },
    stopResponding() {
      respond = false;
    },
  };
}

describe("OffscreenClipboard", () => {
  it("creates the offscreen document and reads clipboard text", async () => {
    const ctx = createContext();

    await expect(ctx.clipboard.readText()).resolves.toBe("clipboard-value");

    expect(ctx.createDocument).toHaveBeenCalledWith({
      url: "chrome-extension://extension-id/offscreen.html",
      reasons: [OFFSCREEN_CLIPBOARD_REASON],
      justification: "Clear password-manager clipboard contents after timeout.",
    });
    expect(ctx.getContexts).toHaveBeenCalledWith({
      contextTypes: [OFFSCREEN_DOCUMENT_CONTEXT],
      documentUrls: ["chrome-extension://extension-id/offscreen.html"],
    });
    expect(ctx.postMessage.mock.calls[0]?.[0]).toEqual({
      target: OFFSCREEN_CLIPBOARD_MESSAGE_TARGET,
      operation: "read",
    });
    expect(ctx.otherClientPostMessage).not.toHaveBeenCalled();
    expect(ctx.matchAll).toHaveBeenCalledWith({
      includeUncontrolled: true,
      type: "window",
    });
  });

  it("reuses an existing document when writing clipboard text", async () => {
    const ctx = createContext(true);

    await expect(
      ctx.clipboard.writeText("next-value"),
    ).resolves.toBeUndefined();

    expect(ctx.createDocument).not.toHaveBeenCalled();
    expect(ctx.postMessage.mock.calls[0]?.[0]).toEqual({
      target: OFFSCREEN_CLIPBOARD_MESSAGE_TARGET,
      operation: "write",
      value: "next-value",
    });
  });

  it("rejects failed offscreen operations", async () => {
    const ctx = createContext(true);
    ctx.setNextResponse({
      ok: false,
      error: "Clipboard operation failed.",
    });

    await expect(ctx.clipboard.readText()).rejects.toThrow(
      "Clipboard operation failed.",
    );
  });

  it("times out when the offscreen document does not respond", async () => {
    vi.useFakeTimers();

    try {
      const ctx = createContext(true);
      ctx.stopResponding();
      const pendingRead = expect(ctx.clipboard.readText()).rejects.toThrow(
        "Offscreen clipboard response timed out.",
      );

      await vi.advanceTimersByTimeAsync(
        OFFSCREEN_CLIPBOARD_RESPONSE_TIMEOUT_MS,
      );

      await pendingRead;
    } finally {
      vi.useRealTimers();
    }
  });
});
