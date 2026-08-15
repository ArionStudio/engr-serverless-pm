import {
  OFFSCREEN_CLIPBOARD_MESSAGE_TARGET,
  type OffscreenClipboardRequest,
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

function isOffscreenClipboardRequest(
  request: unknown,
): request is OffscreenClipboardRequest {
  if (typeof request !== "object" || request === null) {
    return false;
  }

  const record = request as Record<string, unknown>;

  return (
    record.target === OFFSCREEN_CLIPBOARD_MESSAGE_TARGET &&
    (record.operation === "read" ||
      (record.operation === "write" && typeof record.value === "string"))
  );
}

function handleClipboardRequest(request: OffscreenClipboardRequest) {
  if (request.operation === "read") {
    return {
      ok: true as const,
      value: readClipboardText(document, transferControl),
    };
  }

  writeClipboardText(document, transferControl, request.value);
  return { ok: true as const };
}

navigator.serviceWorker.addEventListener("message", (event) => {
  const responsePort = event.ports[0];

  if (responsePort === undefined || !isOffscreenClipboardRequest(event.data)) {
    return;
  }

  try {
    responsePort.postMessage(handleClipboardRequest(event.data));
  } catch {
    responsePort.postMessage({
      ok: false,
      error: "Clipboard operation failed.",
    });
  }
});
