import type { z } from "zod";
import type { VersionVector } from "../versioning/version-vector.type";
import type { folderIdSchema, folderSchema } from "./folder.schema";

export type FolderId = z.infer<typeof folderIdSchema>;
export type FolderInput = z.infer<typeof folderSchema>;

export type Folder = FolderInput & {
  versionVector: VersionVector;
};

export type DeletedFolder = {
  id: FolderId;
  versionVector: VersionVector;
  deletedAt: number;
};

export type VisibleFolderFields = Pick<
  Folder,
  "id" | "name" | "icon" | "description" | "parentId" | "createdAt"
>;
