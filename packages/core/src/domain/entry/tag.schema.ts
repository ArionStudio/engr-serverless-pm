import { z } from "zod";

export const tagIdSchema = z
  .string()
  .min(1)
  .max(128)
  .refine((value) => value === value.trim(), {
    message: "Tag ID must not have surrounding whitespace.",
  });

export const tagGroupIdSchema = z.enum([
  "status",
  "topic",
  "environment",
  "access",
  "other",
]);

export const tagColorSchema = z.enum([
  "gray",
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
]);

export const tagShadeSchema = z.union([
  z.literal(300),
  z.literal(400),
  z.literal(500),
  z.literal(600),
  z.literal(700),
]);

export const tagSchema = z.object({
  id: tagIdSchema,
  name: z.string().trim().min(1).max(32),
  groupId: tagGroupIdSchema,
  color: tagColorSchema,
  shade: tagShadeSchema,
  createdAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});
