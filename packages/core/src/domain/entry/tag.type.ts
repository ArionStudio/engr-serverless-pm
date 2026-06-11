import { z } from "zod";
import type { VersionVector } from "../sync/version-vector.type";
import { tagSchema } from "./tag.schema";

export type TagInput = z.infer<typeof tagSchema>;

export type Tag = TagInput & {
  versionVector: VersionVector;
};

export type DeletedTag = {
  id: number;
  versionVector: VersionVector;
  deletedAt: number;
};
