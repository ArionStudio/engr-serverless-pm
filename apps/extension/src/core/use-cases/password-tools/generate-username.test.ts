import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import type { RandomBytes } from "../../domain/crypto/brand-keys";
import { InvalidGeneratedUsernameSettingsError } from "../__errors/generate-username.errors";
import { GenerateUsernameUseCase } from "./generate-username";

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
    useCase: new GenerateUsernameUseCase(ports.crypto),
  };
}

describe("GenerateUsernameUseCase", () => {
  it("generates a default username that fits password entry login storage", async () => {
    const ctx = createContext([0, 1, 2, 3, 4, 5]);

    const result = await ctx.useCase.execute();

    expect(result).toEqual({
      username: "abacusabdomen2345",
    });
    expect(result.username.length).toBeLessThanOrEqual(128);
    expect(result.username).toMatch(/^[a-z0-9]+$/);
    expect(
      vi
        .mocked(ctx.ports.crypto.generateRandomBytes)
        .mock.calls.every(([byteLength]) => byteLength === 4),
    ).toBe(true);
  });

  it("can generate a capitalized username without a number suffix", async () => {
    const ctx = createContext([2, 3]);

    const result = await ctx.useCase.execute({
      capitalize: true,
      includeNumber: false,
    });

    expect(result).toEqual({
      username: "AbdominalAbide",
    });
  });

  it("keeps generated usernames alphanumeric when source words contain separators", async () => {
    const hyphenatedSourceWordIndexes = [2008, 2527, 6639, 7747];

    for (const wordIndex of hyphenatedSourceWordIndexes) {
      const ctx = createContext([wordIndex, 0]);

      const result = await ctx.useCase.execute({
        includeNumber: false,
      });

      expect(result.username).toMatch(/^[a-z0-9]+$/);
      expect(result.username.length).toBeGreaterThan(0);
    }
  });

  it("keeps generated usernames alphanumeric when source words contain separators and capitalization is enabled", async () => {
    const hyphenatedSourceWordIndexes = [2008, 2527, 6639, 7747];

    for (const wordIndex of hyphenatedSourceWordIndexes) {
      const ctx = createContext([wordIndex, 0]);

      const result = await ctx.useCase.execute({
        capitalize: true,
        includeNumber: false,
      });

      expect(result.username).toMatch(/^[A-Za-z0-9]+$/);
      expect(result.username.length).toBeGreaterThan(0);
    }
  });

  it("rejects settings that do not match the username generator schema", async () => {
    const ctx = createContext();

    await expect(
      ctx.useCase.execute({
        capitalize: "yes",
      } as never),
    ).rejects.toBeInstanceOf(InvalidGeneratedUsernameSettingsError);

    expect(ctx.ports.crypto.generateRandomBytes).not.toHaveBeenCalled();
  });

  it("retries random index selection when sampled value would introduce modulo bias", async () => {
    const ctx = createContext([0xffffffff, 0, 1]);

    const result = await ctx.useCase.execute({
      includeNumber: false,
    });

    expect(result).toEqual({
      username: "abacusabdomen",
    });
    expect(ctx.ports.crypto.generateRandomBytes).toHaveBeenCalledTimes(3);
  });
});
