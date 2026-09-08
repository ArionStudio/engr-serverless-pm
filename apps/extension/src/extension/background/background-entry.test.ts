import { afterEach, describe, expect, it, vi } from "vitest";

describe("background entrypoint", () => {
  afterEach(() => {
    vi.doUnmock("./background.composition");
    vi.doUnmock("./browser-login-runtime");
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("composes, forwards Chrome alarms, and reports terminal failures", async () => {
    const alarmError = new Error("alarm failed");
    const handleAlarm = vi.fn(async () => {
      throw alarmError;
    });
    const browserLogins = { capture: {}, pending: {} };
    const composeBackgroundApplication = vi.fn(() => ({
      browserLogins,
      handleScheduledTaskAlarm: handleAlarm,
    }));
    const installBrowserLoginRuntime = vi.fn();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    let alarmListener: ((alarm: { readonly name: string }) => void) | undefined;
    const addAlarmListener = vi.fn(
      (listener: (alarm: { readonly name: string }) => void) => {
        alarmListener = listener;
      },
    );

    vi.doMock("./background.composition", () => ({
      composeBackgroundApplication,
    }));
    vi.doMock("./browser-login-runtime", () => ({
      installBrowserLoginRuntime,
    }));
    vi.stubGlobal("chrome", {
      alarms: {
        onAlarm: { addListener: addAlarmListener },
      },
    });

    await import("./background");

    expect(composeBackgroundApplication).toHaveBeenCalledOnce();
    expect(installBrowserLoginRuntime).toHaveBeenCalledWith(browserLogins);
    expect(addAlarmListener).toHaveBeenCalledOnce();

    alarmListener?.({ name: "clipboard-alarm" });

    await vi.waitFor(() => {
      expect(handleAlarm).toHaveBeenCalledWith({ name: "clipboard-alarm" });
      expect(consoleError).toHaveBeenCalledOnce();
      expect(consoleError).toHaveBeenCalledWith(
        "Scheduled task alarm handling failed.",
      );
    });
  });
});
