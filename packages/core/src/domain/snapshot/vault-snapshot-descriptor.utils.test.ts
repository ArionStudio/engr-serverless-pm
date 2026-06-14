import { describe, expect, it } from "vitest";
import {
  areVaultSnapshotDescriptorsEqual,
  compareVaultSnapshotDescriptors,
} from "./vault-snapshot-descriptor.utils";

describe("vault snapshot descriptor utils", () => {
  it("compares snapshot descriptors using sync relation names", () => {
    expect(
      compareVaultSnapshotDescriptors(
        {
          vaultId: "vault-id",
          snapshotVersionVector: { A: 7, B: 3 },
          revisionTimestamp: 1,
        },
        {
          vaultId: "vault-id",
          snapshotVersionVector: { A: 7, B: 2 },
          revisionTimestamp: 99,
        },
      ),
    ).toBe("local_ahead");
    expect(
      compareVaultSnapshotDescriptors(
        {
          vaultId: "vault-id",
          snapshotVersionVector: { A: 7, B: 3 },
          revisionTimestamp: 2,
        },
        {
          vaultId: "vault-id",
          snapshotVersionVector: { A: 6, B: 4 },
          revisionTimestamp: 1,
        },
      ),
    ).toBe("broken");
    expect(
      compareVaultSnapshotDescriptors(
        {
          vaultId: "vault-id",
          snapshotVersionVector: { A: 7 },
          revisionTimestamp: 1,
        },
        {
          vaultId: "vault-id",
          snapshotVersionVector: { A: 8 },
          revisionTimestamp: 2,
        },
      ),
    ).toBe("remote_ahead");
  });

  it("checks descriptor equality by vault id, vector, and timestamp", () => {
    expect(
      areVaultSnapshotDescriptorsEqual(
        {
          vaultId: "vault-id",
          snapshotVersionVector: { A: 7 },
          revisionTimestamp: 1,
        },
        {
          vaultId: "vault-id",
          snapshotVersionVector: { A: 7, B: 0 },
          revisionTimestamp: 1,
        },
      ),
    ).toBe(true);
    expect(
      areVaultSnapshotDescriptorsEqual(
        {
          vaultId: "vault-id",
          snapshotVersionVector: { A: 7 },
          revisionTimestamp: 1,
        },
        {
          vaultId: "vault-id",
          snapshotVersionVector: { A: 8 },
          revisionTimestamp: 1,
        },
      ),
    ).toBe(false);
    expect(
      areVaultSnapshotDescriptorsEqual(
        {
          vaultId: "vault-id",
          snapshotVersionVector: { A: 7 },
          revisionTimestamp: 1,
        },
        {
          vaultId: "other-vault-id",
          snapshotVersionVector: { A: 7 },
          revisionTimestamp: 1,
        },
      ),
    ).toBe(false);
    expect(
      areVaultSnapshotDescriptorsEqual(
        {
          vaultId: "vault-id",
          snapshotVersionVector: { A: 7 },
          revisionTimestamp: 1,
        },
        {
          vaultId: "vault-id",
          snapshotVersionVector: { A: 7 },
          revisionTimestamp: 2,
        },
      ),
    ).toBe(false);
  });
});
