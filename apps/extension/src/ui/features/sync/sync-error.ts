export type SyncErrorOperation =
  | "permission"
  | "refresh"
  | "test"
  | "configure"
  | "connect"
  | "repair"
  | "upload"
  | "review"
  | "apply"
  | "disable"
  | "credential-revocation"
  | "revoke-device"
  | "approve-device"
  | "trust-review"
  | "trust-apply";

type SyncTarget = {
  readonly prefix: string;
};

export function isOccupiedSyncTargetError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === "InvalidRemoteVaultSnapshotRecordError"
  );
}

export function syncObjectKey(target: SyncTarget): string {
  return `${target.prefix}vault.enc`;
}

export function syncError(
  error: unknown,
  operation?: SyncErrorOperation,
  target?: SyncTarget,
  fallbackMessage?: string,
): string {
  const name = error instanceof Error ? error.name : "";
  switch (name) {
    case "StorageHostPermissionRequiredError":
      return "Storage access is not allowed in this browser. Allow access to resume sync. Your local vault is unchanged.";
    case "InvalidSyncProviderResponseError":
    case "InvalidStorageLocationError":
    case "InvalidSyncConfigError":
      return "Check the bucket, region, prefix and access keys.";
    case "SyncCredentialsRejectedError":
      return "AWS rejected these access keys. Check or replace them.";
    case "S3ReadCredentialsOrSignatureRejectedError":
      return "AWS rejected the access keys or request signature. Check the access key ID, secret access key and region.";
    case "S3ReadPermissionRejectedError":
      if (operation === "credential-revocation")
        return "AWS denied access but did not confirm that the previous key was deleted. Delete the previous key in AWS IAM, then verify again. Deactivation alone cannot complete verification.";
      return "AWS denied read access. Allow s3:GetObject for this bucket and object prefix.";
    case "S3BucketOrRegionRejectedError":
      return "AWS rejected the bucket or region. Check that the bucket exists and its region matches.";
    case "SyncProviderUploadRejectedError":
      return "AWS rejected the vault upload. Allow s3:PutObject for this bucket and object prefix, and check the bucket and region.";
    case "SyncAlreadyConfiguredError":
      return "Sync is already configured. Refresh the configuration before continuing.";
    case "RemoteVaultSnapshotAheadError":
      if (operation === "revoke-device")
        return "S3 has newer vault changes. Open Sync and review those changes before revoking the device. Keep the current S3 keys active until revocation and its upload succeed.";
      return "Newer remote data exists. Review it before uploading. Initial setup cannot replace an existing remote vault.";
    case "LocalVaultSnapshotAheadError":
      if (operation === "revoke-device")
        return "Local changes need to be uploaded. Open Sync and use Retry upload, then return to Devices. Keep the current keys active until revocation and its upload succeed.";
      return "Local changes need to be uploaded. Use Retry upload before checking again.";
    case "RemoteVaultSnapshotNotFoundError":
      return "The remote vault could not be found. Check the bucket and prefix. Existing sync data will not be recreated automatically.";
    case "RemoteVaultSnapshotChangedError":
    case "LocalVaultSnapshotChangedError":
    case "SyncConflictDetectedError":
      if (operation === "revoke-device")
        return "The vault changed during revocation. Open Sync to review the current changes, then reopen Devices to check whether the device still needs revoking. Keep the current keys active until revocation and its upload succeed.";
      return "The vault changed. Refresh the review before applying choices.";
    case "RemoteVaultSnapshotIntegrityError":
      return "The remote vault could not be verified. Sync is blocked to protect your data.";
    case "InvalidRemoteVaultSnapshotRecordError":
      if (operation === "revoke-device")
        return "The object returned by S3 is not a valid LFSPM vault. Check the bucket and prefix in Sync before retrying. Do not delete the object or current access keys to bypass this error.";
      return target
        ? `An object already exists at the S3 key “${syncObjectKey(target)}”, but it is not a valid LFSPM vault. A new vault needs that object path to be unused. Keep the existing object and choose another object prefix. LFSPM did not replace it.`
        : "The object at this storage location is not a valid LFSPM vault. Sync was not enabled and the object was not replaced.";
    case "InvalidSyncResolutionError":
      return "These choices cannot be applied together. Check sync again, then keep the tags and folders used by the entries you keep, and keep each folder's parent.";
    case "SyncTrustChangeRequiresDeviceTrustFlowError":
      return "Device authorization changed. This vault requires a device-trust review before content can sync.";
    case "LocalSyncCredentialsMissingError":
      return "This device's sync credential record is missing. Routine key replacement cannot recover its pending sync records.";
    case "ReplacementSyncTargetMismatchError":
      if (operation === "revoke-device")
        return "The replacement keys did not reach the same vault snapshot. Use the existing bucket, region and prefix, and grant the new keys access to that location. Open Sync to review any changes, then retry revocation.";
      return "Replacement keys must use the same bucket, region and prefix.";
    case "ReplacementSyncCredentialsRequiredError":
      return "Create a new AWS access-key pair for the same bucket and prefix, then enter it in this revocation form. Keep the current keys active until revocation and its upload succeed.";
    case "ReplacementSyncCredentialsUnchangedError":
      if (operation === "revoke-device")
        return "These are the access keys already used by this vault. Revocation requires a new AWS access-key pair so the removed device's old keys can be deleted. Create a new pair and enter it here; do not replace the keys in Sync first. Keep the old keys active until revocation and its upload succeed, then delete them in AWS and complete the key check in Sync.";
      return "These are the access keys already used by this device. Enter replacement keys for the existing device removal, then retry the device-trust review in Sync.";
    case "CannotRevokeCurrentDeviceError":
      return "You cannot revoke the browser you are currently using. Open this vault on another trusted device and revoke this browser there.";
    case "DeviceToRevokeNotTrustedError":
      return "This device is no longer in the vault's trusted device list. Reopen Devices to see its current status before taking another action.";
    case "PreviousSyncCredentialStillActiveError":
      return "The previous access keys still work. Delete them in AWS IAM, then verify again.";
    case "InvalidDeviceEnrollmentTransitionError":
      return "No valid device addition is available to accept. Check sync or use Review removed devices if access was revoked.";
    case "InvalidDeviceRevocationTransitionError":
      if (operation === "revoke-device")
        return "The vault's device records are not ready for another revocation. Open Sync to review device changes and complete any previous key-deletion check, then reopen Devices. Keep the current keys active until the new revocation and its upload succeed.";
      return "No valid device removal is available with these replacement keys. Confirm the keys and device change with a trusted device.";
    case "CurrentDeviceRevokedError":
      return "This device no longer has vault access. Request access again from a trusted device.";
    case "ProviderCredentialRevocationPendingError":
      if (operation === "revoke-device")
        return "A previous device revocation still needs its old AWS keys deleted. Open Sync, finish any pending upload, delete the keys identified by that previous revocation in AWS, and complete the key check before revoking another device.";
      return "Previous access keys still require revocation. Do not reuse those keys.";
    case "SyncRemovalPendingError":
      return "Sync removal is pending. Finish that operation before changing sync.";
    case "VaultMustBeUnlockedError":
    case "UnlockedVaultSessionExpiredError":
    case "UnlockedVaultSessionInvalidError":
      return "Unlock this vault again before continuing.";
    case "PersistedVaultRollbackIncompleteError":
      return "A sync action failed and the previous local vault state could not be restored. Lock and unlock the vault before continuing.";
    default:
      return fallbackMessage ?? fallbackSyncError(operation);
  }
}

function fallbackSyncError(operation?: SyncErrorOperation): string {
  switch (operation) {
    case "permission":
      return "Could not allow storage access. Check this browser's extension permissions and try again.";
    case "refresh":
      return "Could not refresh sync status. Reopen Sync and try again.";
    case "test":
      return "Could not test storage access. Check the storage details and browser permission, then try again.";
    case "configure":
      return "Sync could not be enabled. Reopen the vault and check its sync status before trying again.";
    case "connect":
      return "The existing S3 vault could not be connected. Check the storage again before trying again.";
    case "repair":
      return "The access keys could not be updated. Reopen Sync and check its status before trying again.";
    case "upload":
      return "The sync upload could not be completed. Check sync status before trying again.";
    case "review":
    case "trust-review":
      return "The sync review could not be prepared. Reopen Sync and try again.";
    case "apply":
    case "trust-apply":
      return "The reviewed changes could not be applied. Refresh the review before trying again.";
    case "disable":
      return "Sync could not be disabled. Reopen Sync and check its status before trying again.";
    case "credential-revocation":
      return "Credential revocation could not be verified. Check the previous key in AWS and try again.";
    case "approve-device":
      return "Could not approve this device. Check the request belongs to this vault and resolve any pending sync changes first.";
    case "revoke-device":
      return "Revocation could not be completed, and the app could not identify the cause. Keep the current S3 keys active. Open Sync to check for a pending upload or device change before retrying; do not assume the device has lost access.";
    default:
      return "Could not complete this sync action. Reopen Sync and try again.";
  }
}
