import { afterEach, describe, expect, it, vi } from "vitest";

describe("background entrypoint", () => {
  afterEach(() => {
    vi.doUnmock("./clipboard-alarm-runtime");
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("composes, forwards Chrome alarms, and reports terminal failures", async () => {
    const alarmError = new Error("alarm failed");
    const handleAlarm = vi.fn(async () => {
      throw alarmError;
    });
    const composeClipboardAlarmHandler = vi.fn(() => handleAlarm);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    let alarmListener: ((alarm: { readonly name: string }) => void) | undefined;
    const addAlarmListener = vi.fn(
      (listener: (alarm: { readonly name: string }) => void) => {
        alarmListener = listener;
      },
    );

    vi.doMock("./clipboard-alarm-runtime", () => ({
      composeClipboardAlarmHandler,
    }));
    vi.stubGlobal("chrome", {
      alarms: {
        onAlarm: { addListener: addAlarmListener },
      },
    });

    await import("./background");

    expect(composeClipboardAlarmHandler).toHaveBeenCalledOnce();
    expect(addAlarmListener).toHaveBeenCalledOnce();

    alarmListener?.({ name: "clipboard-alarm" });

    await vi.waitFor(() => {
      expect(handleAlarm).toHaveBeenCalledWith({ name: "clipboard-alarm" });
      expect(consoleError).toHaveBeenCalledOnce();
      expect(consoleError).toHaveBeenCalledWith(
        "Clipboard alarm handling failed; verify the clipboard is clear.",
      );
    });
  });
});
