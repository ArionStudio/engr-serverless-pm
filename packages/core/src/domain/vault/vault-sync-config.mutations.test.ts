import { describe, expect, it } from "vitest";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import {
  clearVaultProviderCredentialRevocationPending,
  markVaultProviderCredentialRevocationPending,
  markVaultSyncRemovalPending,
  removeVaultSyncTarget,
} from "./vault-sync-config.mutations";

describe("vault sync target mutations", () => {
  it("marks remote removal pending", () => {
    const values = createCoreTestValues();

    expect(
      markVaultSyncRemovalPending(values.decryptedVault).syncRemovalPending,
    ).toBe(true);
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
    const values = createCoreTestValues();
    const result = removeVaultSyncTarget({
      ...values.decryptedVault,
      syncTarget: values.syncTarget,
      syncRemovalPending: true,
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
