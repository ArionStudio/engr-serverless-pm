import { z } from "zod";

export const tagSchema = z.object({
  id: z.number().int().nonnegative(),
  name: z.string().min(1).max(32),
});
