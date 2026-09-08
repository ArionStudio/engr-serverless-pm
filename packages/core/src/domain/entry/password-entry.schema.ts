import { z } from "zod";
import {
  folderIdSchema,
  UNCATEGORIZED_FOLDER_ID,
} from "../organization/folder.schema";
import { tagIdSchema } from "./tag.schema";
import { PASSWORD_ENTRY_TAG_LIMIT } from "./password-entry.const";

export const passwordEntryInputSchema = z.object({
  // An empty password represents an email-link account; write commands require explicit intent.
  password: z.string().max(512),
  login: z.string().min(1).max(128),
  tags: z
    .array(tagIdSchema)
    .max(PASSWORD_ENTRY_TAG_LIMIT)
    .refine((tags) => new Set(tags).size === tags.length, {
      message: "Tag IDs must be unique.",
    }),
  sanitizedUrl: z.string().min(1).max(512),
  folderId: folderIdSchema.default(UNCATEGORIZED_FOLDER_ID),
});
