import { describe, expect, it } from "vitest";
import { syncError } from "./sync-error";

describe("syncError", () => {
  it("distinguishes initiating revocation from accepting an existing removal", () => {
    const error = new Error("private credential detail");
    error.name = "ReplacementSyncCredentialsUnchangedError";
    expect(syncError(error, "revoke-device")).toContain(
      "do not replace the keys in Sync first",
    );
    expect(syncError(error, "trust-review")).toContain(
      "existing device removal",
    );
    expect(syncError(error, "trust-apply")).not.toContain("Create a new pair");
    error.name = "SyncConflictDetectedError";
    expect(syncError(error, "revoke-device")).toContain("reopen Devices");
    expect(syncError(error, "revoke-device")).not.toContain(
      "private credential detail",
    );
  });
  it.each([
    [
      "UnlockedVaultSessionExpiredError",
      "Unlock this vault again before continuing.",
    ],
    [
      "UnlockedVaultSessionInvalidError",
      "Unlock this vault again before continuing.",
    ],
    [
      "InvalidRemoteVaultSnapshotRecordError",
      "The object at this storage location is not a valid LFSPM vault. Sync was not enabled and the object was not replaced.",
    ],
    [
      "InvalidSyncResolutionError",
      "These choices cannot be applied together. Check sync again, then keep the tags and folders used by the entries you keep, and keep each folder's parent.",
    ],
    [
      "PersistedVaultRollbackIncompleteError",
      "A sync action failed and the previous local vault state could not be restored. Lock and unlock the vault before continuing.",
    ],
  ])("maps %s without exposing its message", (name, expected) => {
    const error = new Error("sensitive provider detail");
    error.name = name;

    expect(syncError(error, "configure")).toBe(expected);
  });

  it("uses the active operation for an unclassified failure", () => {
    expect(syncError(new Error("sensitive provider detail"), "configure")).toBe(
      "Sync could not be enabled. Reopen the vault and check its sync status before trying again.",
    );
  });

  it("keeps denied revocation separate from ordinary read-permission repair", () => {
    const error = new Error("sensitive provider detail");
    error.name = "S3ReadPermissionRejectedError";

    expect(syncError(error, "credential-revocation")).toContain(
      "Delete the previous key in AWS IAM",
    );
    expect(syncError(error, "credential-revocation")).not.toContain(
      "Allow s3:GetObject",
    );
    expect(syncError(error, "test")).toContain("Allow s3:GetObject");
  });

  it("names the occupied object key without exposing provider details", () => {
    const error = new Error("private AWS response");
    error.name = "InvalidRemoteVaultSnapshotRecordError";

    const message = syncError(error, "configure", { prefix: "vaults/work/" });

    expect(message).toContain("vaults/work/vault.enc");
    expect(message).toContain(
      "Keep the existing object and choose another object prefix",
    );
    expect(message).not.toContain("private AWS response");
  });
});
