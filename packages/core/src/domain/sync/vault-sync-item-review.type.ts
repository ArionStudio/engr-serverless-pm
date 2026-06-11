export type VaultSyncReviewAction = "use_local" | "use_remote";

export type VaultSyncItemRelation =
  | "equal"
  | "local_ahead"
  | "remote_ahead"
  | "diverged"
  | "local_only"
  | "remote_only";

export type VaultSyncEntryRelation = VaultSyncItemRelation;
