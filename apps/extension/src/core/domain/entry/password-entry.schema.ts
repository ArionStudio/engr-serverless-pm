import { z } from "zod";

export const passwordEntrySchema = z.object({
  id: z.string().min(1).max(128),
  password: z.string().min(1).max(512),
  login: z.string().max(128),
  tags: z.array(z.number().int().nonnegative()).max(10),
  sanitizedUrl: z.string().min(1).max(512),
});
