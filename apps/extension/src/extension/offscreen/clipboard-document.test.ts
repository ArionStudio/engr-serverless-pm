import { describe, expect, it, vi } from "vitest";
import {
  type ClipboardCommandExecutor,
  type ClipboardCopyEventTarget,
  type ClipboardTransferControl,
  readClipboardText,
  writeClipboardText,
} from "./clipboard-document";

function createControl(): ClipboardTransferControl {
  return {
    value: "",
    focus: vi.fn(),
    select: vi.fn(),
  };
}

describe("offscreen clipboard document", () => {
  it("reads through the selected transfer control and clears plaintext", () => {
    const transferControl = createControl();
    const commandExecutor: ClipboardCommandExecutor = {
      execCommand: vi.fn((command) => {
        if (command === "paste") {
          transferControl.value = "clipboard-value";
        }

        return true;
      }),
    };

    expect(readClipboardText(commandExecutor, transferControl)).toBe(
      "clipboard-value",
    );
    expect(commandExecutor.execCommand).toHaveBeenCalledWith("paste");
    expect(transferControl.focus).toHaveBeenCalledOnce();
    expect(transferControl.select).toHaveBeenCalledOnce();
    expect(transferControl.value).toBe("");
  });

  it("writes through the selected transfer control and clears plaintext", () => {
    const transferControl = createControl();
    let copyListener: ((event: ClipboardEvent) => void) | undefined;
    const setData = vi.fn();
    const preventDefault = vi.fn();
    const commandExecutor: ClipboardCommandExecutor & ClipboardCopyEventTarget =
      {
        addEventListener: vi.fn((_type, listener) => {
          copyListener = listener;
        }),
        execCommand: vi.fn(() => {
          copyListener?.({
            clipboardData: { setData },
            preventDefault,
          } as unknown as ClipboardEvent);
          return true;
        }),
        removeEventListener: vi.fn(),
      };

    writeClipboardText(commandExecutor, transferControl, "password");

    expect(setData).toHaveBeenCalledWith("text/plain", "password");
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(commandExecutor.execCommand).toHaveBeenCalledWith("copy");
    expect(commandExecutor.removeEventListener).toHaveBeenCalledWith(
      "copy",
      copyListener,
    );
    expect(transferControl.value).toBe("");
  });

  it("overwrites the clipboard with an exact empty value", () => {
    const transferControl = createControl();
    let copyListener: ((event: ClipboardEvent) => void) | undefined;
    const setData = vi.fn();
    const commandExecutor: ClipboardCommandExecutor & ClipboardCopyEventTarget =
      {
        addEventListener: vi.fn((_type, listener) => {
          copyListener = listener;
        }),
        execCommand: vi.fn(() => {
          expect(transferControl.value).toBe(" ");
          copyListener?.({
            clipboardData: { setData },
            preventDefault: vi.fn(),
          } as unknown as ClipboardEvent);
          return true;
        }),
        removeEventListener: vi.fn(),
      };

    writeClipboardText(commandExecutor, transferControl, "");

    expect(setData).toHaveBeenCalledWith("text/plain", "");
    expect(transferControl.value).toBe("");
  });

  it("clears plaintext when the browser rejects a clipboard command", () => {
    const transferControl = createControl();
    const commandExecutor: ClipboardCommandExecutor & ClipboardCopyEventTarget =
      {
        addEventListener: vi.fn(),
        execCommand: vi.fn(() => false),
        removeEventListener: vi.fn(),
      };

    expect(() =>
      writeClipboardText(commandExecutor, transferControl, "password"),
    ).toThrow("Clipboard copy command failed.");
    expect(commandExecutor.removeEventListener).toHaveBeenCalledOnce();
    expect(transferControl.value).toBe("");
  });

  it("rejects a copy event without writable clipboard data", () => {
    const transferControl = createControl();
    let copyListener: ((event: ClipboardEvent) => void) | undefined;
    const commandExecutor: ClipboardCommandExecutor & ClipboardCopyEventTarget =
      {
        addEventListener: vi.fn((_type, listener) => {
          copyListener = listener;
        }),
        execCommand: vi.fn(() => {
          copyListener?.({
            clipboardData: null,
            preventDefault: vi.fn(),
          } as unknown as ClipboardEvent);
          return true;
        }),
        removeEventListener: vi.fn(),
      };

    expect(() =>
      writeClipboardText(commandExecutor, transferControl, "password"),
    ).toThrow("Clipboard copy event did not expose writable data.");
    expect(commandExecutor.removeEventListener).toHaveBeenCalledOnce();
    expect(transferControl.value).toBe("");
  });

  it("clears plaintext when the browser rejects a paste command", () => {
    const transferControl = createControl();
    const commandExecutor: ClipboardCommandExecutor = {
      execCommand: vi.fn(() => {
        transferControl.value = "clipboard-value";
        return false;
      }),
    };

    expect(() => readClipboardText(commandExecutor, transferControl)).toThrow(
      "Clipboard paste command failed.",
    );
    expect(transferControl.value).toBe("");
  });
});
