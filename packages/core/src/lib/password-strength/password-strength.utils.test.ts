import { describe, expect, it } from "vitest";
import { PASSWORD_STRENGTH_COMMON_PASSWORDS } from "./password-strength.const";
import { calculatePasswordStrength } from "./password-strength.utils";

describe("calculatePasswordStrength", () => {
  it.each([
    ["a".repeat(7), 0],
    ["mixed789", 1],
    ["mixed-value", 1],
    ["mixed-value!", 2],
    ["mixed-value-123", 2],
    ["mixed-value-1234", 3],
    ["mixed-value-12345678", 4],
  ] as const)("scores the code-point length of %j", (password, score) => {
    expect(calculatePasswordStrength(password)).toEqual({ score });
  });

  it("counts Unicode code points rather than UTF-16 code units", () => {
    expect(calculatePasswordStrength("😀😃😄😁😆😅😂🤣😊😇🙂🙃")).toEqual({
      score: 2,
    });
  });

  it("does not count code points introduced by lowercase conversion", () => {
    expect(calculatePasswordStrength("İqwjrtypsdfghkzxvbn")).toEqual({
      score: 3,
    });
  });

  it.each(["password", "PaSsWoRd", "Password1", "passw0rd"])(
    "scores the common password %j as very weak",
    (password) => {
      expect(calculatePasswordStrength(password)).toEqual({ score: 0 });
    },
  );

  it("scores a bounded common-password mutation as weak", () => {
    expect(calculatePasswordStrength("P@ssw0rd123!")).toEqual({ score: 1 });
  });

  it("scores a numeric common password with a bounded suffix as weak", () => {
    expect(calculatePasswordStrength("123456789qwe!@#$%^&*")).toEqual({
      score: 1,
    });
  });

  it("compares the whole password instead of common substrings", () => {
    expect(
      calculatePasswordStrength("unique password phrase with enough words"),
    ).toEqual({ score: 4 });
  });

  it("preserves whitespace during common-password comparison", () => {
    expect(calculatePasswordStrength("pass word")).toEqual({
      score: 1,
    });
  });

  it("uses NFC normalization for common-password comparison", () => {
    const decomposed = "a\u0301bcdefghijk";
    const composed = decomposed.normalize("NFC");

    expect(calculatePasswordStrength(decomposed)).toEqual({ score: 1 });
    expect(calculatePasswordStrength(composed)).toEqual({ score: 1 });
  });

  it.each([
    ["", 0],
    ["aaaaaaaaaaaaaaaa", 0],
    ["abcabcabcabcabcabc", 1],
    ["abcdefghijklmnop", 1],
    ["ponmlkjihgfedcba", 1],
    ["0123456789".repeat(3), 1],
    ["qwertyuiop", 0],
    ["poiuytrewq", 0],
    ["aaaaaaaaaabbbbbbbbbb", 1],
    ["aabbccddeeffgghhiijj", 1],
    ["abcdefghijklmnopqrstuvwx", 1],
    ["passwordpasswordpassword1!", 1],
    ["password-password-password!", 1],
    ["x-abcabcabcabcabcabc-y", 1],
    ["Q!abcabcabcabcabcabc7Z", 1],
    ["correcthorsebatterystaple", 3],
    ["thisisaverylongpassword", 3],
  ] as const)("caps the predictable password %j", (password, score) => {
    expect(calculatePasswordStrength(password)).toEqual({ score });
  });

  it("does not penalize an incidental sequence in a long password", () => {
    expect(
      calculatePasswordStrength("river-abcd-lantern-velvet-canyon"),
    ).toEqual({
      score: 4,
    });
  });

  it("caps a near-repeat with a final mutation", () => {
    expect(calculatePasswordStrength("abcabcabcabcabcabd")).toEqual({
      score: 1,
    });
  });

  it("handles the maximum stored-password length without pattern blowup", () => {
    const password = Array.from({ length: 512 }, (_, index) =>
      String.fromCodePoint(0x400 + index),
    ).join("");

    expect(calculatePasswordStrength(password)).toEqual({ score: 4 });
  });
});

describe("PASSWORD_STRENGTH_COMMON_PASSWORDS", () => {
  it("contains the pinned normalized list in binary-search order", () => {
    expect(PASSWORD_STRENGTH_COMMON_PASSWORDS).toHaveLength(9_916);
    expect(PASSWORD_STRENGTH_COMMON_PASSWORDS.every(Boolean)).toBe(true);
    expect(
      PASSWORD_STRENGTH_COMMON_PASSWORDS.every(
        (password) => password === password.normalize("NFC").toLowerCase(),
      ),
    ).toBe(true);
    expect(
      PASSWORD_STRENGTH_COMMON_PASSWORDS.every(
        (password, index) =>
          index === 0 ||
          PASSWORD_STRENGTH_COMMON_PASSWORDS[index - 1] < password,
      ),
    ).toBe(true);
  });
});
