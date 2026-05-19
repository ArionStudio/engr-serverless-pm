import { z } from "zod";

export const generatedUsernameSettingsSchema = z.object({
  capitalize: z.boolean().default(false),
  includeNumber: z.boolean().default(true),
});
