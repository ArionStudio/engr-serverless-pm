import { z } from "zod";
import type { VersionVector } from "../sync/version-vector.type";
import { passwordEntryInputSchema } from "./password-entry.schema";

export type PasswordEntryInput = z.infer<typeof passwordEntryInputSchema>;

export type PasswordEntry = PasswordEntryInput & {
  id: string;
  versionVector: VersionVector;
};

export type DeletedPasswordEntry = {
  id: string;
  versionVector: VersionVector;
  deletedAt: number;
};

export type VisiblePasswordEntryFields = Pick<
  PasswordEntry,
  "id" | "login" | "tags" | "sanitizedUrl"
>;
