import { describe, expect, it, vi } from "vitest";
import { SystemClockAdapter } from "./system-clock.adapter";

describe("SystemClockAdapter", () => {
  it("delegates every read without caching", () => {
    const readTime = vi
      .fn()
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(2_000);
    const clock = new SystemClockAdapter(readTime);

    expect(clock.now()).toBe(1_000);
    expect(clock.now()).toBe(2_000);
    expect(readTime).toHaveBeenCalledTimes(2);
  });

  it("calls an injected source without an adapter receiver", () => {
    const readTime = vi.fn(function (this: unknown) {
      return 1_000;
    });

    const clock = new SystemClockAdapter(readTime);

    expect(clock.now()).toBe(1_000);
    expect(readTime.mock.contexts).toEqual([undefined]);
  });

  it("preserves a platform failure", () => {
    const failure = new Error("clock unavailable");
    const clock = new SystemClockAdapter(() => {
      throw failure;
    });

    expect(() => clock.now()).toThrow(failure);
  });
});
