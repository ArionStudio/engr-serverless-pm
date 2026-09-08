import type {
  AddEntryCommandParams,
  AddEntryResult,
  UpdateEntryCommandParams,
  RemoveEntryCommandParams,
  ReadEntryResult,
  ReadEntryForEditingResult,
  VisibleVaultFields,
} from "@lfspm/core";
import type { EntryTools } from "./entry-editor.view";

export type WorkspaceCapabilities = {
  read: (vaultId: string) => Promise<VisibleVaultFields>;
  details: (vaultId: string, entryId: string) => Promise<ReadEntryResult>;
  edit: (
    vaultId: string,
    entryId: string,
  ) => Promise<ReadEntryForEditingResult>;
  add: (params: AddEntryCommandParams) => Promise<AddEntryResult>;
  update: (params: UpdateEntryCommandParams) => Promise<AddEntryResult>;
  remove: (params: RemoveEntryCommandParams) => Promise<AddEntryResult>;
  copy: (vaultId: string, entryId: string) => Promise<void>;
  tools: EntryTools;
  subscribe: (
    listener: (reason: "session" | "focus" | "data") => void,
  ) => () => void;
};
