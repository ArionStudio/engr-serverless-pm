import { z } from "zod";

export const UNCATEGORIZED_FOLDER_ID = "uncategorized" as const;

export const folderIdSchema = z
  .string()
  .min(1)
  .max(128)
  .refine((value) => value === value.trim(), {
    message: "Folder ID must not have surrounding whitespace.",
  });

export const folderSchema = z.object({
  id: folderIdSchema.refine((value) => value !== UNCATEGORIZED_FOLDER_ID, {
    message: "The Uncategorized folder ID is reserved.",
  }),
  name: z.string().trim().min(1).max(64),
  icon: z.string().trim().min(1).max(128),
  description: z.string().trim().max(256).optional(),
  parentId: folderIdSchema.nullable(),
  createdAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});
