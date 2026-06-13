import { ZodError } from "zod";

export class InvalidGeneratedPasswordSettingsError extends Error {
  constructor(cause: ZodError) {
    super("Generated password settings are invalid.", { cause });
    this.name = "InvalidGeneratedPasswordSettingsError";
  }
}

export class PasswordGenerationImpossibleError extends Error {
  constructor(reason: string) {
    super(`Password cannot be generated: ${reason}.`);
    this.name = "PasswordGenerationImpossibleError";
  }
}
