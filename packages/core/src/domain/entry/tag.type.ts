import type { z } from "zod";
import type { VersionVector } from "../versioning/version-vector.type";
import type { tagSchema } from "./tag.schema";

export type TagInput = z.infer<typeof tagSchema>;
export type TagId = TagInput["id"];
export type TagGroupId = TagInput["groupId"];
export type TagColor = TagInput["color"];
export type TagShade = TagInput["shade"];

export type Tag = TagInput & {
  versionVector: VersionVector;
};

export type VisibleTagFields = Pick<
  Tag,
  "id" | "name" | "groupId" | "color" | "shade" | "createdAt"
>;

export type DeletedTag = {
  id: TagId;
  versionVector: VersionVector;
  deletedAt: number;
};
