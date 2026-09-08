import { z } from "zod";
import { tagIdSchema } from "./tag.schema";
import { folderIdSchema } from "../organization/folder.schema";

const searchEntryTextSchema = z.string().trim().max(512);

export const searchEntryAnyQuerySchema = z
  .object({
    mode: z.literal("any"),
    value: searchEntryTextSchema.default(""),
  })
  .strict();

export const searchEntryFieldsQuerySchema = z
  .object({
    mode: z.literal("fields"),
    login: searchEntryTextSchema.default(""),
    url: searchEntryTextSchema.default(""),
    tag: z.array(tagIdSchema).max(10).default([]),
    folder: z.array(folderIdSchema).max(10).default([]),
  })
  .strict();

export const searchEntryQuerySchema = z.discriminatedUnion("mode", [
  searchEntryAnyQuerySchema,
  searchEntryFieldsQuerySchema,
]);
