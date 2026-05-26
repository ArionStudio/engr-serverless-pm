import { z } from "zod";

const searchEntryTextSchema = z.string().trim().max(512);

const searchEntryTagIdSchema = z.number().int().nonnegative();

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
    tag: z.array(searchEntryTagIdSchema).max(10).default([]),
  })
  .strict();

export const searchEntryQuerySchema = z.discriminatedUnion("mode", [
  searchEntryAnyQuerySchema,
  searchEntryFieldsQuerySchema,
]);
