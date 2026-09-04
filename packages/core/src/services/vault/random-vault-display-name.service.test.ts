import { describe, expect, it, vi } from "vitest";
import { GENERATED_USERNAME_WORDS } from "../../lib/generate-username";
import { normalizeGeneratedUsernameWord } from "../../lib/generate-username/generated-username-word.policy";
import { RandomVaultDisplayNameService } from "./random-vault-display-name.service";

describe("RandomVaultDisplayNameService", () => {
  it("builds a readable name from unbiased sampled indexes", async () => {
    const abacusIndex = GENERATED_USERNAME_WORDS.indexOf("abacus");
    const oceanIndex = GENERATED_USERNAME_WORDS.indexOf("ocean");
    const pickIndex = vi
      .fn<(maxExclusive: number) => Promise<number>>()
      .mockResolvedValueOnce(abacusIndex)
      .mockResolvedValueOnce(oceanIndex)
      .mockResolvedValueOnce(4_821);
    const service = new RandomVaultDisplayNameService({ pickIndex });

    await expect(service.generateVaultDisplayName()).resolves.toBe(
      "abacus-ocean-4821",
    );
    expect(pickIndex.mock.calls).toEqual([
      [GENERATED_USERNAME_WORDS.length],
      [GENERATED_USERNAME_WORDS.length],
      [10_000],
    ]);
  });

  it.each([
    [0, "0000"],
    [9_999, "9999"],
  ])("pads sampled number %i as %s", async (number, expected) => {
    const pickIndex = vi
      .fn<(maxExclusive: number) => Promise<number>>()
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(number);
    const service = new RandomVaultDisplayNameService({ pickIndex });

    await expect(service.generateVaultDisplayName()).resolves.toBe(
      `abacus-abacus-${expected}`,
    );
  });

  it("keeps every generated format within its declared bounds", () => {
    expect(GENERATED_USERNAME_WORDS).not.toHaveLength(0);

    for (const word of GENERATED_USERNAME_WORDS) {
      expect(normalizeGeneratedUsernameWord(word)).toMatch(/^[a-z0-9]+$/);
    }

    const longestWordLength = Math.max(
      ...GENERATED_USERNAME_WORDS.map(
        (word) => normalizeGeneratedUsernameWord(word).length,
      ),
    );
    expect(longestWordLength * 2 + "--0000".length).toBeLessThanOrEqual(24);
  });

  it("normalizes punctuation in selected corpus entries", async () => {
    const hyphenatedWordIndex = GENERATED_USERNAME_WORDS.indexOf("drop-down");
    const pickIndex = vi
      .fn<(maxExclusive: number) => Promise<number>>()
      .mockResolvedValueOnce(hyphenatedWordIndex)
      .mockResolvedValueOnce(hyphenatedWordIndex)
      .mockResolvedValueOnce(42);
    const service = new RandomVaultDisplayNameService({ pickIndex });

    await expect(service.generateVaultDisplayName()).resolves.toBe(
      "dropdown-dropdown-0042",
    );
  });

  it("allows repeated words without retrying", async () => {
    const pickIndex = vi
      .fn<(maxExclusive: number) => Promise<number>>()
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1);
    const service = new RandomVaultDisplayNameService({ pickIndex });

    await expect(service.generateVaultDisplayName()).resolves.toBe(
      "abacus-abacus-0001",
    );
    expect(pickIndex).toHaveBeenCalledTimes(3);
  });

  it("stops sampling after a failure", async () => {
    const failure = new Error("random source failed");
    const pickIndex = vi
      .fn<(maxExclusive: number) => Promise<number>>()
      .mockRejectedValueOnce(failure);
    const service = new RandomVaultDisplayNameService({ pickIndex });

    await expect(service.generateVaultDisplayName()).rejects.toBe(failure);
    expect(pickIndex).toHaveBeenCalledOnce();
  });
});
