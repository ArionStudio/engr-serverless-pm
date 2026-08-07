import type { PasswordStrength } from "../../lib/password-strength/password-strength.type";
import { calculatePasswordStrength } from "../../lib/password-strength/password-strength.utils";

export type CheckPasswordStrengthCommandParams = {
  password: string;
};

export type CheckPasswordStrengthResult = PasswordStrength;

export class CheckPasswordStrengthUseCase {
  async execute(
    params: CheckPasswordStrengthCommandParams,
  ): Promise<CheckPasswordStrengthResult> {
    return calculatePasswordStrength(params.password);
  }
}
