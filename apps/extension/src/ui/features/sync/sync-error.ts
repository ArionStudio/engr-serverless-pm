export function syncError(
  error: unknown,
  fallbackMessage = "Could not reach or authenticate with S3. Check your connection, region, key permissions and browser storage access, then try again.",
): string {
  const name = error instanceof Error ? error.name : "";
  switch (name) {
    case "StorageHostPermissionRequiredError":
      return "Storage access is not allowed in this browser. Allow access to resume sync. Your local vault is unchanged.";
    case "InvalidSyncProviderResponseError":
    case "InvalidSyncConfigError":
      return "Check the bucket, region, prefix and access keys.";
    case "SyncCredentialsRejectedError":
      return "AWS rejected these access keys. Check or replace them.";
    case "SyncAlreadyConfiguredError":
      return "Sync is already configured. Refresh the configuration before continuing.";
    case "RemoteVaultSnapshotAheadError":
      return "Newer remote data exists. Review it before uploading. Initial setup cannot replace an existing remote vault.";
    case "LocalVaultSnapshotAheadError":
      return "Local changes need to be uploaded. Use Retry upload before checking again.";
    case "RemoteVaultSnapshotNotFoundError":
      return "The remote vault could not be found. Check the bucket and prefix. Existing sync data will not be recreated automatically.";
    case "RemoteVaultSnapshotChangedError":
    case "LocalVaultSnapshotChangedError":
    case "SyncConflictDetectedError":
      return "The vault changed. Refresh the review before applying choices.";
    case "RemoteVaultSnapshotIntegrityError":
      return "The remote vault could not be verified. Sync is blocked to protect your data.";
    case "SyncTrustChangeRequiresDeviceTrustFlowError":
      return "Device authorization changed. This vault requires a device-trust review before content can sync.";
    case "LocalSyncCredentialsMissingError":
      return "This device's sync credential record is missing. Routine key replacement cannot recover its pending sync records.";
    case "ReplacementSyncTargetMismatchError":
      return "Replacement keys must use the same bucket, region and prefix.";
    case "ProviderCredentialRevocationPendingError":
      return "Previous access keys still require revocation. Do not reuse those keys.";
    case "SyncRemovalPendingError":
      return "Sync removal is pending. Finish that operation before changing sync.";
    case "VaultMustBeUnlockedError":
    case "UnlockedVaultSessionExpiredError":
      return "Unlock this vault again before continuing.";
    default:
      return fallbackMessage;
  }
}
