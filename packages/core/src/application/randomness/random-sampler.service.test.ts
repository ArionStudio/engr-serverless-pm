import { describe, expect, it, vi } from "vitest";
import type { RandomBytes } from "../../domain/crypto/brand-keys";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import { RandomSamplerService } from "./random-sampler.service";

function randomBytesFromUint32(value: number): RandomBytes {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setUint32(0, value);

  return buffer as RandomBytes;
}

function createContext(randomValues: number[] = []) {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);

  vi.mocked(ports.crypto.generateRandomBytes).mockImplementation(
    async (byteLength) => {
      if (byteLength !== 4) {
        throw new Error("Unexpected random byte length.");
      }

      return randomBytesFromUint32(randomValues.shift() ?? 0);
    },
  );

  return {
    ports,
    service: new RandomSamplerService(ports.crypto),
  };
}

describe("RandomSamplerService", () => {
  it("picks an index from the requested range", async () => {
    const ctx = createContext([7]);

    await expect(ctx.service.pickIndex(5)).resolves.toBe(2);

    expect(ctx.ports.crypto.generateRandomBytes).toHaveBeenCalledWith(4);
  });

  it("rejects invalid upper bounds", async () => {
    const invalidUpperBounds = [
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ];

    for (const maxExclusive of invalidUpperBounds) {
      const ctx = createContext();

      await expect(ctx.service.pickIndex(maxExclusive)).rejects.toThrow(
        "Random index upper bound must be a positive safe integer within uint32 range.",
      );

      expect(ctx.ports.crypto.generateRandomBytes).not.toHaveBeenCalled();
    }
  });

  it("retries when sampled value would introduce modulo bias", async () => {
    const ctx = createContext([0xffffffff, 3]);

    await expect(ctx.service.pickIndex(5)).resolves.toBe(3);

    expect(ctx.ports.crypto.generateRandomBytes).toHaveBeenCalledTimes(2);
  });

  it("rejects random byte sources that return an invalid byte length", async () => {
    const ctx = createContext();

    vi.mocked(ctx.ports.crypto.generateRandomBytes).mockResolvedValueOnce(
      new ArrayBuffer(3) as RandomBytes,
    );

    await expect(ctx.service.pickIndex(5)).rejects.toThrow(
      "Random byte source returned invalid byte length.",
    );
  });
});
