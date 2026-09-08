import { describe, expect, it } from "vitest";
import {
  InvalidDeviceEnrollmentPrivateStateError,
  InvalidDeviceSyncCredentialStateError,
  InvalidLocalKeysPayloadError,
  InvalidOpenedVaultMasterKeyError,
  InvalidUnlockedVaultSessionPayloadError,
  InvalidVaultSnapshotPayloadError,
} from "./crypto";
import { InvalidDeviceEnrollmentArtifactError as DeviceEnrollmentError } from "./device";
import {
  InvalidDeviceEnrollmentArtifactError as StoredEnrollmentError,
  InvalidLocalVaultSecurityRecordError,
  InvalidLocalVaultSnapshotRecordError,
  InvalidSyncCredentialRecordError,
  InvalidUnlockedVaultSessionMaterialError,
  InvalidUnlockedVaultSessionPayloadRecordError,
} from "./storage";
import {
  InvalidRemoteVaultSnapshotRecordError,
  InvalidSyncProviderResponseError,
  S3BucketOrRegionRejectedError,
  S3ReadCredentialsOrSignatureRejectedError,
  S3ReadPermissionRejectedError,
} from "./sync";

describe("adapter error exports", () => {
  it("exposes every boundary error from its owning adapter barrel", () => {
    expect(DeviceEnrollmentError).toBe(StoredEnrollmentError);

    for (const ErrorType of [
      DeviceEnrollmentError,
      InvalidDeviceEnrollmentPrivateStateError,
      InvalidDeviceSyncCredentialStateError,
      InvalidLocalKeysPayloadError,
      InvalidLocalVaultSecurityRecordError,
      InvalidLocalVaultSnapshotRecordError,
      InvalidOpenedVaultMasterKeyError,
      InvalidRemoteVaultSnapshotRecordError,
      InvalidSyncCredentialRecordError,
      InvalidSyncProviderResponseError,
      S3BucketOrRegionRejectedError,
      S3ReadCredentialsOrSignatureRejectedError,
      S3ReadPermissionRejectedError,
      InvalidUnlockedVaultSessionMaterialError,
      InvalidUnlockedVaultSessionPayloadError,
      InvalidUnlockedVaultSessionPayloadRecordError,
      InvalidVaultSnapshotPayloadError,
    ]) {
      expect(new ErrorType()).toBeInstanceOf(Error);
    }
  });
});
