import type {
  AddEntryCommandParams,
  AddEntryResult,
  UpdateEntryCommandParams,
  RemoveEntryCommandParams,
  ReadEntryResult,
  ReadEntryForEditingResult,
  VisibleVaultFields,
  AddTagCommandParams,
  AddTagResult,
  AddFolderCommandParams,
  AddFolderResult,
  GlobalLibrary,
} from "@lfspm/core";
import type { EntryTools } from "@/ui/features/password-tools/password-tools.type";

export type WorkspaceControls = {
  lock: () => Promise<void>;
};

export type WorkspaceCapabilities = {
  dismissCapturedLogin: (
    vaultId: string,
    tabId: number,
    id: string,
  ) => Promise<void>;
  readActivePageUrl?: () => Promise<string>;
  read: (vaultId: string) => Promise<VisibleVaultFields>;
  details: (vaultId: string, entryId: string) => Promise<ReadEntryResult>;
  edit: (
    vaultId: string,
    entryId: string,
  ) => Promise<ReadEntryForEditingResult>;
  add: (params: AddEntryCommandParams) => Promise<AddEntryResult>;
  update: (params: UpdateEntryCommandParams) => Promise<AddEntryResult>;
  remove: (params: RemoveEntryCommandParams) => Promise<AddEntryResult>;
  createTag: (params: AddTagCommandParams) => Promise<AddTagResult>;
  createFolder: (params: AddFolderCommandParams) => Promise<AddFolderResult>;
  readOrganizationLibrary: () => Promise<GlobalLibrary>;
  copy: (vaultId: string, entryId: string) => Promise<void>;
  tools: EntryTools;
  subscribe: (
    listener: (reason: "session" | "focus" | "data") => void,
  ) => () => void;
};
