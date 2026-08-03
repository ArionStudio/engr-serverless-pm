import type { Brand } from "./common/brand-keys";
import { InvalidNewMasterPasswordError } from "../errors/master-password.errors";
import { calculatePasswordStrength } from "../lib/password-strength/password-strength.utils";

export type RawMasterPassword = Brand<string, "RawMasterPassword">;

export function assertValidNewMasterPassword(
  masterPassword: unknown,
): asserts masterPassword is RawMasterPassword {
  if (
    typeof masterPassword !== "string" ||
    calculatePasswordStrength(masterPassword).score !== 4
  ) {
    throw new InvalidNewMasterPasswordError();
  }
}
