import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import {
  GENERATED_USERNAME_NUMBER_DIGITS,
  GENERATED_USERNAME_WORDS,
} from "../../lib/generate-username/generated-username.const";
import { generateUsernameValue } from "../../lib/generate-username/generated-username.utils";
import { RandomSamplerService } from "../../services/randomness/random-sampler.service";
import type { RandomBytes } from "../../domain/crypto/brand-keys";
import { InvalidGeneratedUsernameSettingsError } from "../../errors/generate-username.errors";
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
  const randomSampler = new RandomSamplerService(ports.crypto);

  return {
    ports,
    randomSampler,
    useCase: new GenerateUsernameUseCase(randomSampler),
  };
}

describe("GenerateUsernameUseCase", () => {
  it("generates a default username that fits password entry login storage", async () => {
    const ctx = createContext([0, 1, 2, 3, 4, 5]);
    const pickIndexSpy = vi.spyOn(ctx.randomSampler, "pickIndex");

    const result = await ctx.useCase.execute();

    expect(result).toEqual({
      username: "abacusabdomen2345",
    });
    expect(result.username.length).toBeLessThanOrEqual(128);
    expect(result.username).toMatch(/^[a-z0-9]+$/);
    expect(pickIndexSpy).toHaveBeenNthCalledWith(
      1,
      GENERATED_USERNAME_WORDS.length,
    );
    expect(pickIndexSpy).toHaveBeenNthCalledWith(
      2,
      GENERATED_USERNAME_WORDS.length,
    );
    expect(
      vi
        .mocked(ctx.ports.crypto.generateRandomBytes)
        .mock.calls.every(([byteLength]) => byteLength === 4),
    ).toBe(true);
  });

  it("keeps every normalized source word unique and within login storage", async () => {
    const generatedUsernames = await Promise.all(
      GENERATED_USERNAME_WORDS.map((_, wordIndex) =>
        generateUsernameValue(
          { capitalize: false, includeNumber: false },
          async () => wordIndex,
        ),
      ),
    );

    expect(GENERATED_USERNAME_WORDS).toHaveLength(7_775);
    expect(new Set(generatedUsernames).size).toBe(generatedUsernames.length);
    expect(
      generatedUsernames.every((username) => /^[a-z0-9]+$/.test(username)),
    ).toBe(true);
    expect(
      Math.max(...generatedUsernames.map((username) => username.length)) +
        GENERATED_USERNAME_NUMBER_DIGITS,
    ).toBeLessThanOrEqual(128);
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
});
