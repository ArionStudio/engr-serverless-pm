import type {
  DeletedPasswordEntry,
  PasswordEntry,
} from "../entry/password-entry.type";
import type {
  VaultSyncItemRelation,
  VaultSyncReviewAction,
} from "./vault-sync-item-review.type";

export type VaultSyncEntryState =
  | { readonly kind: "missing" }
  | { readonly kind: "entry"; readonly entry: PasswordEntry }
  | { readonly kind: "deleted"; readonly deletedEntry: DeletedPasswordEntry };

export type VaultSyncEntryReview = {
  readonly kind: "password_entry";
  readonly entryId: string;
  readonly relation: VaultSyncItemRelation;
  readonly conflict: boolean;
  readonly preselectedAction: VaultSyncReviewAction;
  readonly localState: VaultSyncEntryState;
  readonly remoteState: VaultSyncEntryState;
};

export type VaultSyncEntryResolution =
  | {
      readonly kind: "password_entry";
      readonly entryId: string;
      readonly action: VaultSyncReviewAction;
    }
  | {
      readonly kind: "password_entry";
      readonly entryId: string;
      readonly action: "use_resolved";
      readonly state: VaultSyncEntryState;
    };
