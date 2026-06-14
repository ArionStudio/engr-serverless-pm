import type {
  DeletedPasswordEntry,
  PasswordEntry,
} from "../entry/password-entry.type";
import type {
  ReviewableVaultSyncItemRelation,
  VaultSyncReviewAction,
} from "./vault-sync-item-review.type";

export type ReviewableEntry =
  | {
      entry: PasswordEntry;
      state: "entry";
    }
  | {
      deletedEntry: DeletedPasswordEntry;
      state: "deleted";
    }
  | {
      state: "missing";
    };

export type EntryReviewItem = {
  entryId: string;
  relation: ReviewableVaultSyncItemRelation;
  readonly localEntry: ReviewableEntry;
  readonly remoteEntry: ReviewableEntry;
  readonly preselectedAction: VaultSyncReviewAction;
};
