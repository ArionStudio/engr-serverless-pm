import { describe, expect, it, vi } from "vitest";
import {
  createBrowserClipboardAdapter,
  type BrowserClipboardEnvironment,
} from "./browser-clipboard.factory";
import { OffscreenClipboardAdapter } from "./offscreen-clipboard.adapter";
import { NavigatorClipboardAdapter } from "./navigator-clipboard.adapter";

function createEnvironment(): BrowserClipboardEnvironment {
  return {
    navigatorClipboard: {
      readText: vi.fn(async () => "firefox clipboard"),
      writeText: vi.fn(async () => undefined),
    },
  };
}

describe("browser clipboard composition", () => {
  it("uses the extension document clipboard when the offscreen API is unavailable", async () => {
    const environment = createEnvironment();
    const adapter = createBrowserClipboardAdapter(environment);

    expect(adapter).toBeInstanceOf(NavigatorClipboardAdapter);
    await expect(adapter.readText()).resolves.toBe("firefox clipboard");
    await expect(adapter.writeText("next value")).resolves.toBeUndefined();
    expect(environment.navigatorClipboard.writeText).toHaveBeenCalledWith(
      "next value",
    );
  });

  it("retains Chrome's offscreen bridge when the API is available", () => {
    const environment: BrowserClipboardEnvironment = {
      ...createEnvironment(),
      offscreen: { createDocument: vi.fn(async () => undefined) },
      runtime: {
        getContexts: vi.fn(async () => []),
        sendMessage: vi.fn(async () => ({ ok: true })),
      },
      offscreenDocumentUrl: "chrome-extension://extension-id/offscreen.html",
    };

    expect(createBrowserClipboardAdapter(environment)).toBeInstanceOf(
      OffscreenClipboardAdapter,
    );
  });
});
