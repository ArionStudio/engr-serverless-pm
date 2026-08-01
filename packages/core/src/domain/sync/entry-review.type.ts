import type {
  DeletedPasswordEntry,
  VisiblePasswordEntryFields,
} from "../entry/password-entry.type";
import type {
  ReviewableVaultSyncItemRelation,
  VaultSyncReviewAction,
} from "./vault-sync-item-review.type";

export type ReviewableEntry =
  | {
      entry: VisiblePasswordEntryFields;
      state: "entry";
    }
  | {
      deletedEntry: Pick<DeletedPasswordEntry, "id" | "deletedAt">;
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
  readonly passwordChanged: boolean;
  readonly preselectedAction: VaultSyncReviewAction;
};
