import { z } from "zod";
import { tagColorSchema, tagGroupIdSchema } from "../entry/tag.schema";

const organizationTextSchema = z.string().trim().min(1).max(128);

export const tagGroupSchema = z.object({
  id: tagGroupIdSchema,
  name: z.string().trim().min(1).max(32),
  icon: organizationTextSchema,
  baseColor: tagColorSchema,
  description: z.string().trim().max(256).optional(),
});
