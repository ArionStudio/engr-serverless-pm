import { afterEach, describe, expect, it, vi } from "vitest";

describe("background entrypoint", () => {
  afterEach(() => {
    vi.doUnmock("./clipboard-alarm-runtime");
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("composes and forwards Chrome alarm events", async () => {
    const handleAlarm = vi.fn(async () => undefined);
    const composeClipboardAlarmHandler = vi.fn(() => handleAlarm);
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
    });
  });
});
