import {
  OFFSCREEN_CLIPBOARD_MESSAGE_TARGET,
  type OffscreenClipboardAdapterRequest,
} from "../../adapters/clipboard";
import { readClipboardText, writeClipboardText } from "./clipboard-document";

function getTransferControl(): HTMLTextAreaElement {
  const element = document.getElementById("clipboard-transfer");

  if (!(element instanceof HTMLTextAreaElement)) {
    throw new Error("Clipboard transfer control is unavailable.");
  }

  return element;
}

const transferControl = getTransferControl();

function isOffscreenClipboardAdapterRequest(
  request: unknown,
): request is OffscreenClipboardAdapterRequest {
  if (typeof request !== "object" || request === null) {
    return false;
  }

  const record = request as Record<string, unknown>;

  return (
    record.target === OFFSCREEN_CLIPBOARD_MESSAGE_TARGET &&
    typeof record.deadlineEpochMs === "number" &&
    Number.isFinite(record.deadlineEpochMs) &&
    (record.operation === "read" ||
      (record.operation === "write" && typeof record.value === "string"))
  );
}

function handleClipboardRequest(request: OffscreenClipboardAdapterRequest) {
  if (Date.now() >= request.deadlineEpochMs) {
    return {
      ok: false as const,
      error: "Clipboard request expired.",
    };
  }

  if (request.operation === "read") {
    return {
      ok: true as const,
      value: readClipboardText(document, transferControl),
    };
  }

  writeClipboardText(document, transferControl, request.value);
  return { ok: true as const };
}

chrome.runtime.onMessage.addListener(
  (request: unknown, _sender, sendResponse) => {
    if (!isOffscreenClipboardAdapterRequest(request)) {
      return;
    }

    try {
      sendResponse(handleClipboardRequest(request));
    } catch {
      sendResponse({
        ok: false,
        error: "Clipboard operation failed.",
      });
    }
  },
);
