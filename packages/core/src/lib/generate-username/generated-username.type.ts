import type { z } from "zod";
import type { generatedUsernameSettingsSchema } from "./generated-username.schema";

export type GeneratedUsernameSettings = z.infer<
  typeof generatedUsernameSettingsSchema
>;

export type GeneratedUsernamePickIndex = (
  maxExclusive: number,
) => Promise<number>;
