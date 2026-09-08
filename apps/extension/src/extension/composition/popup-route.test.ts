import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consumePopupReviewRequest, openDetectedPopup } from "./popup-route";

const openPopup = vi.fn<() => Promise<void>>();
let activeTab = 7;
let activeWindow = 3;
beforeEach(() => {
  const storage = new Map<string, unknown>();
  activeTab = 7;
  activeWindow = 3;
  openPopup.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", {
    locks: {
      request: (_name: string, operation: () => Promise<unknown>) =>
        operation(),
    },
  });
  vi.stubGlobal("chrome", {
    action: { openPopup },
    tabs: { query: async () => [{ id: activeTab, windowId: activeWindow }] },
    storage: {
      session: {
        set: async (values: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(values))
            storage.set(key, value);
        },
        get: async (key: string) => ({ [key]: storage.get(key) }),
        remove: async (key: string) => {
          storage.delete(key);
        },
      },
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("popup review handoff", () => {
  it("opens Detected once for the requesting tab", async () => {
    expect(await openDetectedPopup(7, 3, Date.now() + 5_000)).toBe(true);
    expect(await consumePopupReviewRequest()).toBe("detected");
    expect(await consumePopupReviewRequest()).toBe("vault");
  });

  it("discards an unconsumed handoff after its deadline", async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      expect(await openDetectedPopup(7, 3, now + 100)).toBe(true);
      clock.mockReturnValue(now + 100);
      expect(await consumePopupReviewRequest()).toBe("vault");
      clock.mockReturnValue(now);
      expect(await consumePopupReviewRequest()).toBe("vault");
    } finally {
      clock.mockRestore();
    }
  });

  it("does not route a different tab to Detected", async () => {
    await openDetectedPopup(7, 3, Date.now() + 5_000);
    activeTab = 8;
    expect(await consumePopupReviewRequest()).toBe("vault");
    activeTab = 7;
    expect(await consumePopupReviewRequest()).toBe("vault");
  });

  it("keeps simultaneous Detected handoffs separate across windows", async () => {
    await openDetectedPopup(7, 3, Date.now() + 5_000);
    activeWindow = 4;
    activeTab = 8;
    expect(await consumePopupReviewRequest()).toBe("vault");
    await openDetectedPopup(8, 4, Date.now() + 5_000);
    expect(await consumePopupReviewRequest()).toBe("detected");
    activeWindow = 3;
    activeTab = 7;
    expect(await consumePopupReviewRequest()).toBe("detected");
    expect(await consumePopupReviewRequest()).toBe("vault");
  });

  it("routes the current tab when it changes while consumption waits for the lock", async () => {
    await openDetectedPopup(8, 3, Date.now() + 5_000);
    vi.stubGlobal("navigator", {
      locks: {
        request: async (_name: string, operation: () => Promise<unknown>) => {
          activeTab = 8;
          return operation();
        },
      },
    });
    expect(await consumePopupReviewRequest()).toBe("detected");
    expect(await consumePopupReviewRequest()).toBe("vault");
  });

  it("removes a failed opening before a later toolbar click", async () => {
    openPopup.mockRejectedValueOnce(new Error("User gesture required"));
    expect(await openDetectedPopup(7, 3, Date.now() + 5_000)).toBe(false);
    expect(await consumePopupReviewRequest()).toBe("vault");
  });

  it("does not remove a newer request when an older opening fails", async () => {
    let rejectFirst: (reason: Error) => void = () => {};
    openPopup.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectFirst = reject;
        }),
    );
    const first = openDetectedPopup(7, 3, Date.now() + 5_000);
    await vi.waitFor(() => expect(openPopup).toHaveBeenCalledOnce());
    expect(await openDetectedPopup(8, 3, Date.now() + 5_000)).toBe(true);
    rejectFirst(new Error("Opening failed"));
    expect(await first).toBe(false);
    activeTab = 8;
    expect(await consumePopupReviewRequest()).toBe("detected");
  });
});

it("does not leave a handoff or open a popup after waiting past its deadline", async () => {
  const now = Date.now();
  const clock = vi.spyOn(Date, "now").mockReturnValue(now);
  vi.stubGlobal("navigator", {
    locks: {
      request: async (_name: string, operation: () => Promise<unknown>) => {
        clock.mockReturnValue(now + 100);
        return operation();
      },
    },
  });
  try {
    expect(await openDetectedPopup(7, 3, now + 100)).toBe(false);
    expect(openPopup).not.toHaveBeenCalled();
    expect(await consumePopupReviewRequest()).toBe("vault");
  } finally {
    clock.mockRestore();
  }
});
