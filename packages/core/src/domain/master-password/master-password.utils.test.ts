import { describe, expect, it } from "vitest";
import { objectGraphContainsString } from "../../__tests__/fixtures/error-inspection";
import { InvalidNewMasterPasswordError } from "../../errors/master-password.errors";
import { assertNewMasterPasswordMeetsPolicy } from "./master-password.utils";

describe("new master password policy", () => {
  it("accepts only a maximum-strength password", () => {
    expect(() =>
      assertNewMasterPasswordMeetsPolicy("vN7#qL2!xP9@rT4$zK6&"),
    ).not.toThrow();
  });

  it.each([
    "password",
    "abcabcabcabcabcabc",
    "mixed-value!",
    "correcthorsebatterystaple",
  ])("rejects a password below maximum strength", (submittedPassword) => {
    expect(() => assertNewMasterPasswordMeetsPolicy(submittedPassword)).toThrow(
      InvalidNewMasterPasswordError,
    );
  });

  it("rejects a non-string password", () => {
    expect(() => assertNewMasterPasswordMeetsPolicy(undefined)).toThrow(
      InvalidNewMasterPasswordError,
    );
  });

  it("does not retain the rejected password in the error", () => {
    const submittedPassword = "thisisaverylongpassword";

    let thrownError: unknown;

    try {
      assertNewMasterPasswordMeetsPolicy(submittedPassword);
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toBeInstanceOf(InvalidNewMasterPasswordError);
    expect(thrownError).toMatchObject({
      name: "InvalidNewMasterPasswordError",
      message: "New master password does not meet the password policy.",
    });
    expect(thrownError).not.toHaveProperty("cause");
    expect(objectGraphContainsString(thrownError, submittedPassword)).toBe(
      false,
    );
  });
});
