import { z } from "zod";
import { generatedUsernameSettingsSchema } from "./generated-username.schema";

export type GeneratedUsernameSettings = z.infer<
  typeof generatedUsernameSettingsSchema
>;

export type GeneratedUsernamePickIndex = (
  maxExclusive: number,
) => Promise<number>;
