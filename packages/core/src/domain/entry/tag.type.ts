import { z } from "zod";
import { tagSchema } from "./tag.schema";

export type Tag = z.infer<typeof tagSchema>;
