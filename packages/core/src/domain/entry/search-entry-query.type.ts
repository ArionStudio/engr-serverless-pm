import { z } from "zod";
import {
  searchEntryAnyQuerySchema,
  searchEntryFieldsQuerySchema,
  searchEntryQuerySchema,
} from "./search-entry-query.schema";

export type SearchEntryAnyQuery = z.infer<typeof searchEntryAnyQuerySchema>;

export type SearchEntryFieldsQuery = z.infer<
  typeof searchEntryFieldsQuerySchema
>;

export type SearchEntryQuery = z.infer<typeof searchEntryQuerySchema>;
