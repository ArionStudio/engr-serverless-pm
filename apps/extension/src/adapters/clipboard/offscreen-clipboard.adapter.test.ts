import { describe, expect, it, vi } from "vitest";
import {
  type ChromeOffscreenApi,
  type ChromeRuntimeMessenger,
  OFFSCREEN_CLIPBOARD_MESSAGE_TARGET,
  OFFSCREEN_CLIPBOARD_REASON,
  OFFSCREEN_CLIPBOARD_RESPONSE_TIMEOUT_MS,
  OFFSCREEN_DOCUMENT_CONTEXT,
  OffscreenClipboardAdapter,
} from "./offscreen-clipboard.adapter";

function createContext(documentExists = false) {
  const createDocument = vi.fn(async () => undefined);
  const offscreen: ChromeOffscreenApi = {
    createDocument,
  };
  let nextResponse: unknown;
  let respond = true;
  const sendMessage = vi.fn((request: unknown): Promise<unknown> => {
    if (!respond) {
      return new Promise(() => undefined);
    }

    const operation =
      typeof request === "object" && request !== null
        ? (request as Record<string, unknown>).operation
        : undefined;
    const response =
      nextResponse ??
      (operation === "read"
        ? { ok: true, value: "clipboard-value" }
        : { ok: true });
    nextResponse = undefined;
    return Promise.resolve(response);
  });
  const documentUrl = "chrome-extension://extension-id/offscreen.html";
  const getContexts = vi.fn(async () =>
    documentExists ? [{ contextType: OFFSCREEN_DOCUMENT_CONTEXT }] : [],
  );
  const runtime: ChromeRuntimeMessenger = { getContexts, sendMessage };
  const clipboard = new OffscreenClipboardAdapter(
    offscreen,
    runtime,
    documentUrl,
  );

  return {
    clipboard,
    createDocument,
    getContexts,
    sendMessage,
    setNextResponse(response: unknown) {
      nextResponse = response;
    },
    stopResponding() {
      respond = false;
    },
  };
}

describe("OffscreenClipboardAdapter", () => {
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
    expect(ctx.sendMessage).toHaveBeenCalledWith({
      target: OFFSCREEN_CLIPBOARD_MESSAGE_TARGET,
      operation: "read",
      deadlineEpochMs: expect.any(Number),
    });
  });

  it("reuses an existing document when writing clipboard text", async () => {
    const ctx = createContext(true);

    await expect(
      ctx.clipboard.writeText("next-value"),
    ).resolves.toBeUndefined();

    expect(ctx.createDocument).not.toHaveBeenCalled();
    expect(ctx.sendMessage).toHaveBeenCalledWith({
      target: OFFSCREEN_CLIPBOARD_MESSAGE_TARGET,
      operation: "write",
      value: "next-value",
      deadlineEpochMs: expect.any(Number),
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

  it("rejects when runtime messaging cannot reach the offscreen document", async () => {
    const ctx = createContext(true);
    ctx.sendMessage.mockRejectedValueOnce(
      new Error("Receiving end does not exist."),
    );

    await expect(ctx.clipboard.readText()).rejects.toThrow(
      "Receiving end does not exist.",
    );
  });

  it("rejects a synchronous runtime messaging failure", async () => {
    const ctx = createContext(true);
    ctx.sendMessage.mockImplementationOnce(() => {
      throw new Error("Runtime messaging is unavailable.");
    });

    await expect(ctx.clipboard.readText()).rejects.toThrow(
      "Runtime messaging is unavailable.",
    );
  });

  it("rejects malformed offscreen responses", async () => {
    const ctx = createContext(true);
    ctx.setNextResponse({ ok: "yes" });

    await expect(ctx.clipboard.readText()).rejects.toThrow(
      "Offscreen clipboard returned an invalid response.",
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

  it("keeps concurrent runtime responses associated with their requests", async () => {
    const ctx = createContext(true);
    let resolveFirstResponse:
      | ((response: { readonly ok: true; readonly value: string }) => void)
      | undefined;
    const firstResponse = new Promise<{
      readonly ok: true;
      readonly value: string;
    }>((resolve) => {
      resolveFirstResponse = resolve;
    });
    ctx.sendMessage
      .mockImplementationOnce(() => firstResponse)
      .mockResolvedValueOnce({ ok: true, value: "second-value" });

    const firstRead = ctx.clipboard.readText();
    const secondRead = ctx.clipboard.readText();

    await expect(secondRead).resolves.toBe("second-value");
    resolveFirstResponse?.({ ok: true, value: "first-value" });
    await expect(firstRead).resolves.toBe("first-value");
  });
});
