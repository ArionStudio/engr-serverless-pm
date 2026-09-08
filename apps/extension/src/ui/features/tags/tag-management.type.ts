import type {
  AddTagCommandParams,
  AddTagResult,
  ReadTagsResult,
  ReadTagGroupsResult,
  RemoveTagCommandParams,
  RemoveTagResult,
  UpdateTagCommandParams,
  UpdateTagResult,
} from "@lfspm/core";

export type TagManagementReadResult = ReadTagsResult & ReadTagGroupsResult;

export type TagManagementCapabilities = {
  read: (vaultId: string) => Promise<TagManagementReadResult>;
  add: (params: AddTagCommandParams) => Promise<AddTagResult>;
  update: (params: UpdateTagCommandParams) => Promise<UpdateTagResult>;
  remove: (params: RemoveTagCommandParams) => Promise<RemoveTagResult>;
  subscribe: (listener: () => void) => () => void;
};
