import type {
  ReadDeviceManagementResult,
  RevokeDeviceResult,
  SyncUploadStatus,
} from "@lfspm/core";
import type { SyncLocation } from "../sync/sync.type";
import type { CredentialDraft } from "../sync/credential-form.view";

export type EnrollmentSetupInput = {
  approval: string;
  password: string;
  deviceName: string;
  duration: number;
  credentials?: CredentialDraft;
};
export type DeviceCapabilities = {
  inspect: (vaultId: string) => Promise<
    ReadDeviceManagementResult & {
      location?: Pick<CredentialDraft, "bucket" | "region" | "prefix">;
    }
  >;
  reviewRequest: (text: string) => Promise<{
    deviceId: string;
    fingerprint: string;
    requestId: string;
    vaultId: string;
  }>;
  approve: (
    vaultId: string,
    text: string,
  ) => Promise<{ text: string; syncUpload: SyncUploadStatus }>;
  revoke: (
    vaultId: string,
    deviceId: string,
    credentials?: CredentialDraft,
  ) => Promise<RevokeDeviceResult>;
  createRequest: (
    vaultId: string,
    fingerprint: string,
    password: string,
  ) => Promise<{
    text: string;
    requestId: string;
    deviceId: string;
    fingerprint: string;
  }>;
  readApproval: (
    text: string,
    password: string,
  ) => Promise<{ vaultId: string; requestId: string; location: SyncLocation }>;
  copy: (text: string) => Promise<void>;
  download: (text: string, kind: "request" | "approval") => void;
  requestAccess: (location: SyncLocation) => Promise<void>;
  subscribe: (
    listener: (invalidate?: boolean | "pagehide") => void,
  ) => () => void;
};
