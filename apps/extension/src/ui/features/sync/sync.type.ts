import type {
  ApplySyncResolutionCommandParams,
  PrepareSyncReviewResult,
  SyncUploadResult,
} from "@lfspm/core";
import type { CredentialDraft } from "./credential-form.view";

export type SyncLocation = Pick<
  CredentialDraft,
  "bucket" | "region" | "prefix"
>;
export type SyncCapabilities = {
  requestAccess: (target: SyncLocation) => Promise<void>;
  hasAccess: (target: SyncLocation) => Promise<boolean>;
  copySetupText: (value: string) => Promise<void>;
  inspect: (vaultId: string) => Promise<SyncLocation | null>;
  test: (vaultId: string, draft: CredentialDraft) => Promise<void>;
  configure: (
    vaultId: string,
    draft: CredentialDraft,
  ) => Promise<SyncUploadResult>;
  repair: (vaultId: string, draft: CredentialDraft) => Promise<void>;
  upload: (vaultId: string) => Promise<SyncUploadResult>;
  review: (vaultId: string) => Promise<PrepareSyncReviewResult>;
  apply: (
    params: ApplySyncResolutionCommandParams,
  ) => Promise<SyncUploadResult>;
  subscribe: (
    listener: (reason: "session" | "focus" | "permissions") => void,
  ) => () => void;
};

export const emptyCredentials: CredentialDraft = {
  bucket: "",
  region: "",
  prefix: "vault/",
  accessKeyId: "",
  secretAccessKey: "",
};
