import type { JsonValue } from "../common/json.type";

export type SyncProvider = "aws-s3-v1";

export type SyncConfig = {
  readonly provider: SyncProvider;
  readonly providerConfig: JsonValue;
};
