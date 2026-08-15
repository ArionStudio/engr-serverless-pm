import { describe, expect, it, vi } from "vitest";
import {
  type ClipboardCommandExecutor,
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
    const observedValues: string[] = [];
    const commandExecutor: ClipboardCommandExecutor = {
      execCommand: vi.fn(() => {
        observedValues.push(transferControl.value);
        return true;
      }),
    };

    writeClipboardText(commandExecutor, transferControl, "password");

    expect(observedValues).toEqual(["password"]);
    expect(commandExecutor.execCommand).toHaveBeenCalledWith("copy");
    expect(transferControl.value).toBe("");
  });

  it("clears plaintext when the browser rejects a clipboard command", () => {
    const transferControl = createControl();
    const commandExecutor: ClipboardCommandExecutor = {
      execCommand: vi.fn(() => false),
    };

    expect(() =>
      writeClipboardText(commandExecutor, transferControl, "password"),
    ).toThrow("Clipboard copy command failed.");
    expect(transferControl.value).toBe("");
  });
});
