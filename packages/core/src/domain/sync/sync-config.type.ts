import type { JsonValue } from "../common/json.type";

export type SyncProvider = "aws-s3-v1";

export type SyncTarget = {
  readonly provider: SyncProvider;
  readonly targetConfig: JsonValue;
};

export type SyncCredentials = {
  readonly provider: SyncProvider;
  readonly credentialsConfig: JsonValue;
};

export type SyncAccess = {
  readonly target: SyncTarget;
  readonly credentials: SyncCredentials;
};

export type SyncSetupInput = {
  readonly provider: SyncProvider;
  readonly providerConfig: JsonValue;
};
