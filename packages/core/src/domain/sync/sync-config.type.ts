export type SyncProvider = "aws-s3-v1";

export type SyncConfig = {
  readonly provider: SyncProvider;
  readonly providerConfig: unknown;
};
