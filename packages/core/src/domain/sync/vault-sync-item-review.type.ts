export type VaultSyncReviewAction = "use_local" | "use_remote";

/**
 * Item relation used by the download-review flow.
 *
 * `equal` means no review row should be created.
 * `broken` marks impossible or unintended item state in this flow.
 */
export type VaultSyncItemRelation =
  | "equal"
  | "remote_ahead"
  | "remote_only"
  | "broken";

export type ReviewableVaultSyncItemRelation = Exclude<
  VaultSyncItemRelation,
  "equal" | "broken"
>;
