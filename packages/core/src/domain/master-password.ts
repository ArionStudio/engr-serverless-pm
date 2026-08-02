import { z } from "zod";
import type { Brand } from "./common/brand-keys";
import { InvalidNewMasterPasswordError } from "../errors/master-password.errors";
import { meetsMasterPasswordStrengthRequirement } from "./master-password-strength";

export type RawMasterPassword = Brand<string, "RawMasterPassword">;

export const MASTER_PASSWORD_MINIMUM_LENGTH = 16;

const newMasterPasswordSchema = z
  .string()
  .refine(
    (masterPassword) =>
      [...masterPassword].length >= MASTER_PASSWORD_MINIMUM_LENGTH &&
      meetsMasterPasswordStrengthRequirement(masterPassword),
  );

export function assertValidNewMasterPassword(
  masterPassword: unknown,
): asserts masterPassword is RawMasterPassword {
  if (!newMasterPasswordSchema.safeParse(masterPassword).success) {
    throw new InvalidNewMasterPasswordError();
  }
}
