import { describe, expect, it } from "vitest";
import { objectGraphContainsString } from "../__tests__/fixtures/error-inspection";
import { InvalidNewMasterPasswordError } from "../errors/master-password.errors";
import {
  assertValidNewMasterPassword,
  MASTER_PASSWORD_MINIMUM_LENGTH,
} from "./master-password";

describe("new master password policy", () => {
  it("accepts a strong generated password at the minimum length", () => {
    const password = "vN7#qL2!xP9@rT4$";

    expect([...password]).toHaveLength(MASTER_PASSWORD_MINIMUM_LENGTH);
    expect(() => assertValidNewMasterPassword(password)).not.toThrow();
  });

  it("accepts a strong random-word passphrase", () => {
    expect(() =>
      assertValidNewMasterPassword("orbit lantern velvet canyon river"),
    ).not.toThrow();
  });

  it.each([
    ["a".repeat(MASTER_PASSWORD_MINIMUM_LENGTH), "repeated characters"],
    ["Password1234567!", "a predictable mixed-character password"],
  ])("rejects %s (%s)", (submittedPassword) => {
    expect(() => assertValidNewMasterPassword(submittedPassword)).toThrow(
      InvalidNewMasterPasswordError,
    );
  });

  it("rejects a strong password below the minimum length", () => {
    expect(() => assertValidNewMasterPassword("vN7#qL2!xP9@rT4")).toThrow(
      InvalidNewMasterPasswordError,
    );
  });

  it("rejects a weak password without retaining it in the error", () => {
    const submittedPassword = "Password1234567!";

    let thrownError: unknown;

    try {
      assertValidNewMasterPassword(submittedPassword);
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
