import { z } from "zod";

export const passwordEntryInputSchema = z.object({
  password: z.string().min(1).max(512),
  login: z.string().min(1).max(128),
  tags: z.array(z.number().int().nonnegative()).max(10),
  sanitizedUrl: z.string().min(1).max(512),
});
