import type {
  DeletedFolder,
  Folder,
  FolderId,
} from "../organization/folder.type";
import type {
  ReviewableVaultSyncItemRelation,
  VaultSyncReviewAction,
} from "./vault-sync-item-review.type";

export type ReviewableFolder =
  | {
      folder: Folder;
      state: "folder";
    }
  | {
      deletedFolder: DeletedFolder;
      state: "deleted";
    }
  | {
      state: "missing";
    };

export type FolderReviewItem = {
  folderId: FolderId;
  relation: ReviewableVaultSyncItemRelation;
  readonly localFolder: ReviewableFolder;
  readonly remoteFolder: ReviewableFolder;
  readonly preselectedAction: VaultSyncReviewAction;
};
