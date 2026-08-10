import { describe, it, expect } from "vitest";
import { bestEffortWipeArrayBuffers, secureWipe } from "./secure-wipe.utils";

describe("secureWipe", () => {
  it("zeros a buffer filled with non-zero data", () => {
    const buffer = new Uint8Array([0xff, 0xab, 0x42, 0x01]);
    secureWipe(buffer);
    expect(buffer.every((b) => b === 0)).toBe(true);
  });

  it("does not throw on an empty buffer", () => {
    const buffer = new Uint8Array(0);
    expect(() => secureWipe(buffer)).not.toThrow();
    expect(buffer.length).toBe(0);
  });

  it.each([1, 16, 32, 256])("zeros a buffer of %i bytes", (size) => {
    const buffer = new Uint8Array(size);
    crypto.getRandomValues(buffer);
    secureWipe(buffer);
    expect(buffer.every((b) => b === 0)).toBe(true);
  });

  it("preserves buffer length after wipe", () => {
    const buffer = new Uint8Array(64);
    crypto.getRandomValues(buffer);
    secureWipe(buffer);
    expect(buffer.length).toBe(64);
  });
});

describe("bestEffortWipeArrayBuffers", () => {
  it("continues wiping after encountering a detached buffer", () => {
    const detached = new Uint8Array([1]).buffer;
    structuredClone(detached, { transfer: [detached] });
    const remaining = new Uint8Array([7]).buffer;

    expect(() =>
      bestEffortWipeArrayBuffers([detached, remaining]),
    ).not.toThrow();
    expect(Array.from(new Uint8Array(remaining))).toEqual([0]);
  });
});
