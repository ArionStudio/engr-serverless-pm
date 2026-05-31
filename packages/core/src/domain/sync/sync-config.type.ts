import type { JsonValue } from "../common/json.type";

export type SyncProvider = "aws-s3-v1";

export type SyncConfig = {
  readonly provider: SyncProvider;
  // Provider config is persisted inside the encrypted vault, so core requires it
  // to be JSON-serializable. The provider-specific shape is intentionally owned
  // by the adapter selected by `provider`; core must not model AWS/S3 fields or
  // validate their semantics.
  readonly providerConfig: JsonValue;
};
