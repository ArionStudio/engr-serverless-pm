import type { z } from "zod";
import type { VersionVector } from "../versioning/version-vector.type";
import type { tagSchema } from "./tag.schema";

export type TagInput = z.infer<typeof tagSchema>;

export type Tag = TagInput & {
  versionVector: VersionVector;
};

export type DeletedTag = {
  id: number;
  versionVector: VersionVector;
  deletedAt: number;
};
