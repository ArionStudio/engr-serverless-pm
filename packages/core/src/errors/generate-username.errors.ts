import { ZodError } from "zod";

export class InvalidGeneratedUsernameSettingsError extends Error {
  constructor(cause: ZodError) {
    super("Generated username settings are invalid.", { cause });
    this.name = "InvalidGeneratedUsernameSettingsError";
  }
}
