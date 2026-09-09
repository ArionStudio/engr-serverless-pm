import type { DeviceCapabilities } from "@/ui/features/devices/device-management.type";
import { ReplacementSyncCredentialsUnchangedError } from "@lfspm/core";

export function galleryDevices(
  failed = false,
  refreshFails = false,
  syncConfigured = true,
  reusedRevocationKeys = false,
  authorizationLost = false,
): DeviceCapabilities {
  let revoked = false;
  let changed = false;
  let refreshFailed = false;
  return {
    inspect: async (vaultId) => {
      if (authorizationLost && changed) {
        const error = new Error("The vault session ended.");
        error.name = "UnlockedVaultSessionExpiredError";
        throw error;
      }
      if (failed || (refreshFails && changed && !refreshFailed)) {
        refreshFailed = true;
        throw new Error("Unavailable");
      }
      return {
        vaultId,
        currentDeviceId: "device-home",
        syncConfigured,
        location: {
          bucket: "personal-vault",
          region: "eu-central-1",
          prefix: "vault/",
        },
        genesisCertificateDigest: "a1b2c3d4".repeat(8),
        devices: [
          { id: "device-home", name: "Home laptop", state: "current" },
          ...(syncConfigured
            ? [
                {
                  id: "device-travel",
                  name: "Travel laptop",
                  state: revoked ? ("revoked" as const) : ("other" as const),
                },
              ]
            : []),
        ],
      };
    },
    reviewRequest: async () => ({
      deviceId: "device-new",
      requestId: "request-new",
      vaultId: "gallery-vault",
      fingerprint: "1a2b3c4d".repeat(8),
    }),
    approve: async () => {
      changed = true;
      return {
        text: '{"fixture":"device-approval"}',
        syncUpload: refreshFails ? "pending" : "complete",
      };
    },
    revoke: async () => {
      if (reusedRevocationKeys)
        throw new ReplacementSyncCredentialsUnchangedError("gallery-vault");
      revoked = true;
      changed = true;
      return {
        vault: {
          entries: [],
          tags: [],
          tagGroups: [],
          folders: [],
          deviceProfiles: [],
          syncConfigured: true,
        },
        snapshotVersionVector: {},
        revisionTimestamp: 0,
        syncUpload: "complete",
        providerCredentialRevocation: "pending_external_deletion",
      };
    },
    createRequest: async () => ({
      text: '{"fixture":"device-request"}',
      requestId: "request-new",
      deviceId: "device-new",
      fingerprint: "1a2b3c4d".repeat(8),
    }),
    readApproval: async () => ({
      location: {
        bucket: "personal-vault",
        region: "eu-central-1",
        prefix: "vault/",
      },
      vaultId: "gallery-vault",
      requestId: "request-new",
    }),
    copy: async () => {},
    download: () => {},
    requestAccess: async () => {},
    subscribe: () => () => {},
  };
}
