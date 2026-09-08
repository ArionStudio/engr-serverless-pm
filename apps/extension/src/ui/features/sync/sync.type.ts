import type {
  ApplySyncResolutionCommandParams,
  PrepareDeviceEnrollmentConsumptionResult,
  PrepareDeviceRevocationConsumptionResult,
  PrepareExistingSyncConnectionResult,
  GetSyncConfigurationResult,
  PrepareSyncReviewResult,
  SyncUploadResult,
} from "@lfspm/core";
import type { CredentialDraft } from "./credential-form.view";

export type SyncLocation = Pick<
  CredentialDraft,
  "bucket" | "region" | "prefix"
>;
export type SyncManagementState = Pick<
  GetSyncConfigurationResult,
  "providerCredentialRevocationPending" | "syncRemovalPending"
>;
export type TrustReview =
  | { kind: "enrollment"; result: PrepareDeviceEnrollmentConsumptionResult }
  | { kind: "revocation"; result: PrepareDeviceRevocationConsumptionResult };
export type InitialSyncResult =
  | { readonly kind: "enabled"; readonly result: SyncUploadResult }
  | {
      readonly kind: "existing";
      readonly connection: PrepareExistingSyncConnectionResult;
    };
export type RevealedSyncKeys = {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly sessionId: string;
};
export type SyncCapabilities = {
  revealAccessKeys: (
    vaultId: string,
    password: string,
  ) => Promise<RevealedSyncKeys>;
  copyAccessKey: (
    vaultId: string,
    sessionId: string,
    value: string,
  ) => Promise<void>;
  inspectManagement: (vaultId: string) => Promise<SyncManagementState>;
  disable: (vaultId: string) => Promise<void>;
  completeCredentialRevocation: (vaultId: string) => Promise<
    SyncUploadResult & {
      providerCredentialRevocation: "complete" | "pending_external_deletion";
    }
  >;
  prepareEnrollment: (
    vaultId: string,
  ) => Promise<PrepareDeviceEnrollmentConsumptionResult>;
  prepareRevocation: (
    vaultId: string,
    draft: CredentialDraft,
  ) => Promise<PrepareDeviceRevocationConsumptionResult>;
  acceptEnrollment: (
    params: ApplySyncResolutionCommandParams,
  ) => Promise<SyncUploadResult>;
  acceptRevocation: (
    params: ApplySyncResolutionCommandParams,
    draft: CredentialDraft,
  ) => Promise<SyncUploadResult>;

  requestAccess: (target: SyncLocation) => Promise<void>;
  hasAccess: (target: SyncLocation) => Promise<boolean>;
  copySetupText: (value: string) => Promise<void>;
  inspect: (vaultId: string) => Promise<SyncLocation | null>;
  test: (vaultId: string, draft: CredentialDraft) => Promise<void>;
  configure: (
    vaultId: string,
    draft: CredentialDraft,
  ) => Promise<InitialSyncResult>;
  connectExisting: (
    vaultId: string,
    draft: CredentialDraft,
    connection: PrepareExistingSyncConnectionResult,
  ) => Promise<SyncUploadResult>;
  repair: (vaultId: string, draft: CredentialDraft) => Promise<void>;
  upload: (vaultId: string) => Promise<SyncUploadResult>;
  review: (vaultId: string) => Promise<PrepareSyncReviewResult>;
  apply: (
    params: ApplySyncResolutionCommandParams,
  ) => Promise<SyncUploadResult>;
  subscribe: (
    listener: (
      reason:
        | "session"
        | "focus"
        | "permissions"
        | "permissions-removed"
        | "pagehide",
      affectsLocation?: (location: SyncLocation) => boolean,
    ) => void,
  ) => () => void;
};

export const emptyCredentials: CredentialDraft = {
  bucket: "",
  region: "",
  prefix: "vault/",
  accessKeyId: "",
  secretAccessKey: "",
};
