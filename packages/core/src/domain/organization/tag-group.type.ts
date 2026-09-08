import type { z } from "zod";
import type { tagGroupSchema } from "./tag-group.schema";

export type TagGroup = z.infer<typeof tagGroupSchema>;

export type VisibleTagGroupFields = Readonly<TagGroup>;
