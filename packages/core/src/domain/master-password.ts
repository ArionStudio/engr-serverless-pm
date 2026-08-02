import { z } from "zod";
import type { Brand } from "./common/brand-keys";
import { InvalidNewMasterPasswordError } from "../errors/master-password.errors";

export type RawMasterPassword = Brand<string, "RawMasterPassword">;

export const MASTER_PASSWORD_MINIMUM_LENGTH = 12;

const newMasterPasswordSchema = z
  .string()
  .min(MASTER_PASSWORD_MINIMUM_LENGTH);

export function assertValidNewMasterPassword(
  masterPassword: unknown,
): asserts masterPassword is RawMasterPassword {
  if (!newMasterPasswordSchema.safeParse(masterPassword).success) {
    throw new InvalidNewMasterPasswordError();
  }
}
