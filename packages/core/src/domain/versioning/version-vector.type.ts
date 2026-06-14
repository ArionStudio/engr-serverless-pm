export type VersionVector = Record<string, number>;

/**
 * Snapshot-level relation between local and remote version vectors.
 *
 * equal: local and remote describe the same snapshot version.
 * local_ahead: local has newer local-device snapshot changes and may be
 * uploaded or extended with more local changes.
 * remote_ahead: remote has newer snapshot changes and local writes must wait
 * for sync/review.
 * remote_missing: remote descriptor is absent even though sync is configured;
 * this is a recoverable user-facing state.
 * broken: an impossible or integrity-invalid state, for example crossed vector
 * components or descriptor mismatch with equal vectors.
 */
export type VersionVectorRelation =
  | "equal"
  | "local_ahead"
  | "remote_ahead"
  | "remote_missing"
  | "broken";
