import { describe, expect, it } from "vitest";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import {
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

  it("removes target and pending marker", () => {
    const values = createCoreTestValues();
    const result = removeVaultSyncTarget({
      ...values.decryptedVault,
      syncTarget: values.syncTarget,
      syncRemovalPending: true,
    });

    expect("syncTarget" in result).toBe(false);
    expect("syncRemovalPending" in result).toBe(false);
  });
});
