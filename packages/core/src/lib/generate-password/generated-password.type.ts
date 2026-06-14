import type { z } from "zod";
import { generatedPasswordSettingsSchema } from "./generated-password.schema";

export type GeneratedPasswordSettings = z.infer<
  typeof generatedPasswordSettingsSchema
>;

export type GeneratedPasswordCharacterSets = {
  numbers: string;
  special: string;
  all: string;
};

export type GeneratedPasswordPickIndex = (
  maxExclusive: number,
) => Promise<number>;
