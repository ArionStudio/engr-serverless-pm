import { InvalidNewMasterPasswordError } from "../../errors/master-password.errors";
import { calculatePasswordStrength } from "../../lib/password-strength/password-strength.utils";

export function assertNewMasterPasswordMeetsPolicy(
  masterPassword: unknown,
): void {
  if (
    typeof masterPassword !== "string" ||
    calculatePasswordStrength(masterPassword).score !== 4
  ) {
    throw new InvalidNewMasterPasswordError();
  }
}
