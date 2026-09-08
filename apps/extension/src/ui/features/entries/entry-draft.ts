import type { EntryDraft } from "./entry-form.view";
import { UNCATEGORIZED_FOLDER_ID } from "@lfspm/core";
export const emptyEntryDraft: EntryDraft = {
  login: "",
  url: "",
  password: "",
  tagIds: [],
  folderId: UNCATEGORIZED_FOLDER_ID,
  allowWeakPassword: false,
};
