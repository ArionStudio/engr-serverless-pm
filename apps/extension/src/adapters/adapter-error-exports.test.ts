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
      InvalidUnlockedVaultSessionMaterialError,
      InvalidUnlockedVaultSessionPayloadError,
      InvalidUnlockedVaultSessionPayloadRecordError,
      InvalidVaultSnapshotPayloadError,
    ]) {
      expect(new ErrorType()).toBeInstanceOf(Error);
    }
  });
});
