import type {
  AddFolderCommandParams,
  AddFolderResult,
  MoveFolderCommandParams,
  MoveFolderResult,
  ReadFoldersResult,
  RemoveFolderCommandParams,
  RemoveFolderResult,
  UpdateFolderCommandParams,
  UpdateFolderResult,
  GlobalLibrary,
} from "@lfspm/core";

export type FolderManagementCapabilities = {
  readOrganizationLibrary: () => Promise<GlobalLibrary>;
  read: (vaultId: string) => Promise<ReadFoldersResult>;
  add: (params: AddFolderCommandParams) => Promise<AddFolderResult>;
  update: (params: UpdateFolderCommandParams) => Promise<UpdateFolderResult>;
  move: (params: MoveFolderCommandParams) => Promise<MoveFolderResult>;
  remove: (params: RemoveFolderCommandParams) => Promise<RemoveFolderResult>;
  subscribe: (listener: () => void) => () => void;
};
