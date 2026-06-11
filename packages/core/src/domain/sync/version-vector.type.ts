export type VersionVector = Record<string, number>;

export type VersionVectorRelation =
  | "equal"
  | "local_ahead"
  | "remote_ahead"
  | "diverged";
