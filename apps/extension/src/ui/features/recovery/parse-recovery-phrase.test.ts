import { describe, expect, it } from "vitest";
import { parseRecoveryPhrase } from "./parse-recovery-phrase";

const words = Array.from({ length: 24 }, (_, index) =>
  String.fromCharCode(97 + index),
);
const numbered = words.map((word, index) => `${index + 1}. ${word}`);

describe("recovery phrase presentation parsing", () => {
  it("preserves plain word order across case, line breaks and PDF spaces", () => {
    expect(parseRecoveryPhrase(words.join("\u00a0\r\n").toUpperCase())).toEqual(
      words,
    );
  });
  it.each(["\n", "\r\n", "\t", " ", "\u00a0"])(
    "accepts the exported numbered list with separator %j",
    (separator) => {
      expect(
        parseRecoveryPhrase(numbered.join(separator).toUpperCase()),
      ).toEqual(words);
    },
  );
  it("accepts numbers separated from words by PDF line wrapping", () => {
    expect(
      parseRecoveryPhrase(numbered.join("\n").replaceAll(". ", ".\n")),
    ).toEqual(words);
  });
  it.each([
    numbered.slice(1).join("\n"),
    numbered.map((line, index) => (index === 10 ? "10. k" : line)).join("\n"),
    [numbered[1], numbered[0], ...numbered.slice(2)].join("\n"),
    [...numbered, "25. extra"].join("\n"),
    numbered
      .map((line, index) => (index === 10 ? words[index] : line))
      .join("\n"),
    "Recovery record\n" + numbered.join("\n"),
    numbered.join("\n") + "\nKeep this private",
    numbered.join("\n").replace("12. l", "12. l?"),
  ])(
    "rejects incomplete or ambiguous input without guessing its order",
    (value) => {
      expect(parseRecoveryPhrase(value)).toBeUndefined();
    },
  );
});
