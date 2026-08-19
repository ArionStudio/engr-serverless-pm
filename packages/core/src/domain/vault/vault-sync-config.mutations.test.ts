import { describe, expect, it } from "vitest";
import { createUnlockVaultTestContext } from "../../__tests__/fixtures/unlock-vault";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import {
  clearVaultSyncRemovalPending,
  clearVaultProviderCredentialRevocationPending,
  markVaultProviderCredentialRevocationPending,
  markVaultSyncRemovalPending,
  removeVaultSyncTarget,
} from "./vault-sync-config.mutations";

describe("vault sync target mutations", () => {
  it("marks remote removal pending", () => {
    const { values, vaultSnapshot } = createUnlockVaultTestContext();
    const expectedRemoteSnapshotIdentity = {
      descriptor: {
        vaultId: values.vaultId,
        snapshotVersionVector: { [values.deviceId]: 1 },
        revisionTimestamp: values.timestamp,
      },
      snapshotDigest: values.vaultSnapshotDigest,
    };

    expect(
      markVaultSyncRemovalPending(
        values.decryptedVault,
        expectedRemoteSnapshotIdentity,
        vaultSnapshot,
      ).syncRemovalPending,
    ).toEqual({
      expectedRemoteSnapshotIdentity,
      rollbackSnapshot: vaultSnapshot,
    });
  });

  it("clears pending remote removal without removing the sync target", () => {
    const { values, vaultSnapshot } = createUnlockVaultTestContext();
    const result = clearVaultSyncRemovalPending({
      ...values.decryptedVault,
      syncTarget: values.syncTarget,
      syncRemovalPending: {
        expectedRemoteSnapshotIdentity: null,
        rollbackSnapshot: vaultSnapshot,
      },
    });

    expect(result.syncTarget).toEqual(values.syncTarget);
    expect("syncRemovalPending" in result).toBe(false);
  });

  it("marks and clears provider credential revocation", () => {
    const values = createCoreTestValues();
    const pendingVault = markVaultProviderCredentialRevocationPending(
      values.decryptedVault,
      [values.pendingDeviceId],
      2,
    );

    expect(pendingVault.providerCredentialRevocationPending).toEqual({
      revokedDeviceIds: [values.pendingDeviceId],
      vaultKeyGeneration: 2,
    });
    expect(
      "providerCredentialRevocationPending" in
        clearVaultProviderCredentialRevocationPending(pendingVault),
    ).toBe(false);
  });

  it("removes target and pending marker", () => {
    const { values, vaultSnapshot } = createUnlockVaultTestContext();
    const result = removeVaultSyncTarget({
      ...values.decryptedVault,
      syncTarget: values.syncTarget,
      syncRemovalPending: {
        expectedRemoteSnapshotIdentity: null,
        rollbackSnapshot: vaultSnapshot,
      },
      providerCredentialRevocationPending: {
        revokedDeviceIds: [values.pendingDeviceId],
        vaultKeyGeneration: 2,
      },
    });

    expect("syncTarget" in result).toBe(false);
    expect("syncRemovalPending" in result).toBe(false);
    expect("providerCredentialRevocationPending" in result).toBe(false);
  });
});
