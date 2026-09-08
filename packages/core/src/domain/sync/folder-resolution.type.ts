import type { FolderId } from "../organization/folder.type";
import type { VaultSyncReviewAction } from "./vault-sync-item-review.type";

export type FolderReviewResolution = {
  readonly folderId: FolderId;
  readonly action: VaultSyncReviewAction;
};
