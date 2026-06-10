import { describe, expect, it } from "vitest";
import {
  areRemoteVaultSnapshotDescriptorsEqual,
  compareLocalAndRemoteSnapshotDescriptors,
} from "./vault-snapshot-version.utils";

describe("vault snapshot version utils", () => {
  it("compares local and remote snapshot descriptors using sync relation names", () => {
    expect(
      compareLocalAndRemoteSnapshotDescriptors(
        {
          vaultId: "vault-id",
          versionVector: { A: 7, B: 3 },
          revisionTimestamp: 1,
        },
        {
          vaultId: "vault-id",
          versionVector: { A: 7, B: 2 },
          revisionTimestamp: 99,
        },
      ),
    ).toBe("local_ahead");
    expect(
      compareLocalAndRemoteSnapshotDescriptors(
        {
          vaultId: "vault-id",
          versionVector: { A: 7, B: 3 },
          revisionTimestamp: 2,
        },
        {
          vaultId: "vault-id",
          versionVector: { A: 6, B: 4 },
          revisionTimestamp: 1,
        },
      ),
    ).toBe("diverged");
    expect(
      compareLocalAndRemoteSnapshotDescriptors(
        {
          vaultId: "vault-id",
          versionVector: { A: 7 },
          revisionTimestamp: 1,
        },
        {
          vaultId: "vault-id",
          versionVector: { A: 8 },
          revisionTimestamp: 2,
        },
      ),
    ).toBe("remote_ahead");
  });

  it("checks descriptor equality by vault id, vector, and timestamp", () => {
    expect(
      areRemoteVaultSnapshotDescriptorsEqual(
        {
          vaultId: "vault-id",
          versionVector: { A: 7 },
          revisionTimestamp: 1,
        },
        {
          vaultId: "vault-id",
          versionVector: { A: 7, B: 0 },
          revisionTimestamp: 1,
        },
      ),
    ).toBe(true);
    expect(
      areRemoteVaultSnapshotDescriptorsEqual(
        {
          vaultId: "vault-id",
          versionVector: { A: 7 },
          revisionTimestamp: 1,
        },
        {
          vaultId: "vault-id",
          versionVector: { A: 8 },
          revisionTimestamp: 1,
        },
      ),
    ).toBe(false);
  });
});
