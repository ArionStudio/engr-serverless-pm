import type { ClipboardPort } from "@lfspm/core";
import {
  OFFSCREEN_CLIPBOARD_DOCUMENT_PATH,
  type ChromeOffscreenApi,
  type ChromeRuntimeMessenger,
  OffscreenClipboardAdapter,
} from "./offscreen-clipboard.adapter";
import {
  NavigatorClipboardAdapter,
  type NavigatorClipboardApi,
} from "./navigator-clipboard.adapter";

export type BrowserClipboardEnvironment = {
  readonly navigatorClipboard: NavigatorClipboardApi;
  readonly offscreen?: ChromeOffscreenApi;
  readonly runtime?: ChromeRuntimeMessenger;
  readonly offscreenDocumentUrl?: string;
};

function readBrowserClipboardEnvironment(): BrowserClipboardEnvironment {
  return {
    navigatorClipboard: navigator.clipboard,
    offscreen: chrome.offscreen,
    runtime: chrome.runtime,
    offscreenDocumentUrl: chrome.runtime.getURL(
      OFFSCREEN_CLIPBOARD_DOCUMENT_PATH,
    ),
  };
}

/**
 * Keeps Chrome's service-worker clipboard bridge while using the Clipboard API
 * directly in Firefox's background document and extension pages.
 */
export function createBrowserClipboardAdapter(
  environment: BrowserClipboardEnvironment = readBrowserClipboardEnvironment(),
): ClipboardPort {
  if (
    environment.offscreen !== undefined &&
    environment.runtime !== undefined &&
    environment.offscreenDocumentUrl !== undefined
  ) {
    return new OffscreenClipboardAdapter(
      environment.offscreen,
      environment.runtime,
      environment.offscreenDocumentUrl,
    );
  }

  return new NavigatorClipboardAdapter(environment.navigatorClipboard);
}
