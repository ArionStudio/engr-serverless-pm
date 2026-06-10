import type { DeletedTag, Tag } from "../entry/tag.type";
import type {
  VaultSyncItemRelation,
  VaultSyncReviewAction,
} from "./vault-sync-item-review.type";

export type VaultSyncTagState =
  | { readonly kind: "missing" }
  | { readonly kind: "tag"; readonly tag: Tag }
  | { readonly kind: "deleted"; readonly deletedTag: DeletedTag };

export type VaultSyncTagReview = {
  readonly kind: "tag";
  readonly tagId: number;
  readonly relation: VaultSyncItemRelation;
  readonly conflict: boolean;
  readonly preselectedAction: VaultSyncReviewAction;
  readonly localState: VaultSyncTagState;
  readonly remoteState: VaultSyncTagState;
};

export type VaultSyncTagResolution =
  | {
      readonly kind: "tag";
      readonly tagId: number;
      readonly action: VaultSyncReviewAction;
    }
  | {
      readonly kind: "tag";
      readonly tagId: number;
      readonly action: "use_resolved";
      readonly state: VaultSyncTagState;
    };
