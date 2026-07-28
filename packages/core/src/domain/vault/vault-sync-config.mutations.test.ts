import { describe, expect, it } from "vitest";
import type { Vault } from "./vault";
import {
  markVaultSyncRemovalPending,
  removeVaultSyncConfig,
} from "./vault-sync-config.mutations";

function createVault(overrides: Partial<Vault> = {}): Vault {
  return {
    versionVector: {},
    entries: [],
    deletedEntries: [],
    deviceProfiles: [],
    deletedDeviceProfiles: [],
    tags: [],
    deletedTags: [],
    ...overrides,
  };
}

describe("vault sync config mutations", () => {
  it("marks sync removal pending without removing sync config", () => {
    const vault = createVault({
      syncConfig: {
        provider: "aws-s3-v1",
        providerConfig: {
          bucketName: "vault-bucket",
        },
      },
    });

    const updatedVault = markVaultSyncRemovalPending(vault);

    expect(updatedVault.syncRemovalPending).toBe(true);
    expect(updatedVault.syncConfig).toEqual(vault.syncConfig);
    expect(vault.syncRemovalPending).toBeUndefined();
  });

  it("removes sync config without mutating the source vault", () => {
    const vault = createVault({
      syncConfig: {
        provider: "aws-s3-v1",
        providerConfig: {
          bucketName: "vault-bucket",
        },
      },
      syncRemovalPending: true,
    });

    const updatedVault = removeVaultSyncConfig(vault);

    expect("syncConfig" in updatedVault).toBe(false);
    expect("syncRemovalPending" in updatedVault).toBe(false);
    expect(vault.syncConfig).toEqual({
      provider: "aws-s3-v1",
      providerConfig: {
        bucketName: "vault-bucket",
      },
    });
  });
});
