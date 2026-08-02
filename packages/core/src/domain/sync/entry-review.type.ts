import type {
  DeletedPasswordEntry,
  PasswordEntry,
  VisiblePasswordEntryFields,
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

export type VisibleReviewableEntry =
  | {
      readonly entry: VisiblePasswordEntryFields;
      readonly state: "entry";
    }
  | {
      readonly deletedEntry: Pick<DeletedPasswordEntry, "id" | "deletedAt">;
      readonly state: "deleted";
    }
  | {
      readonly state: "missing";
    };

export type VisibleEntryReviewItem = {
  readonly entryId: string;
  readonly relation: ReviewableVaultSyncItemRelation;
  readonly localEntry: VisibleReviewableEntry;
  readonly remoteEntry: VisibleReviewableEntry;
  readonly passwordChanged: boolean;
  readonly preselectedAction: VaultSyncReviewAction;
};
