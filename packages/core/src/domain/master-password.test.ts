import { describe, expect, it } from "vitest";
import { objectGraphContainsString } from "../__tests__/fixtures/error-inspection";
import { InvalidNewMasterPasswordError } from "../errors/master-password.errors";
import {
  assertValidNewMasterPassword,
  MASTER_PASSWORD_MINIMUM_LENGTH,
} from "./master-password";

describe("new master password policy", () => {
  it("accepts the documented minimum length", () => {
    const password = "a".repeat(MASTER_PASSWORD_MINIMUM_LENGTH);

    expect(() => assertValidNewMasterPassword(password)).not.toThrow();
  });

  it("rejects a short password without retaining it in the error", () => {
    const submittedPassword = "weak-pass-1";

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
