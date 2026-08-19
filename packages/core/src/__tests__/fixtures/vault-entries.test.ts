import { describe, expect, it } from "vitest";
import { createCoreTestPorts } from "./ports";
import { createCoreTestValues } from "./values";
import {
  createUnlockedVaultWithEntries,
  createVaultSnapshotServiceMock,
} from "./vault-entries";

describe("createVaultSnapshotServiceMock", () => {
  it("directly restores a historical snapshot over its current replacement", async () => {
    const values = createCoreTestValues();
    const ports = createCoreTestPorts(values);
    const service = createVaultSnapshotServiceMock(values, ports);
    const unlockedVault = createUnlockedVaultWithEntries(values, []);
    const originalSnapshot = await service.requireLocalVaultSnapshot(
      values.vaultId,
    );
    const persisted = await service.persistUnlockedVault(
      values.vaultId,
      unlockedVault,
      originalSnapshot.metadata.snapshotVersionVector,
    );

    await service.restoreLocalVaultSnapshot(
      originalSnapshot,
      persisted.snapshot,
      unlockedVault,
    );

    expect(ports.saved.vaultSnapshot).toBe(originalSnapshot);
    expect(ports.saved.vaultSnapshotDigest).toBe(values.vaultSnapshotDigest);
    expect(ports.saved.localVaultTrustCheckpoint).toBe(
      values.localVaultTrustCheckpoint,
    );
  });

  it("rejects a different snapshot with the current ID and vector", async () => {
    const values = createCoreTestValues();
    const ports = createCoreTestPorts(values);
    const service = createVaultSnapshotServiceMock(values, ports);
    const currentSnapshot = await service.requireLocalVaultSnapshot(
      values.vaultId,
    );
    const sameVectorClone = {
      ...currentSnapshot,
      metadata: { ...currentSnapshot.metadata },
    };

    await expect(
      service.prepareLocalVaultSnapshotRestore(
        sameVectorClone,
        createUnlockedVaultWithEntries(values, []),
      ),
    ).rejects.toThrow(
      "Expected the prepared restore fixture state to match the current snapshot.",
    );
  });

  it("creates a distinct coherent snapshot tuple for sequential persists", async () => {
    const values = createCoreTestValues();
    const ports = createCoreTestPorts(values);
    const service = createVaultSnapshotServiceMock(values, ports);
    const unlockedVault = createUnlockedVaultWithEntries(values, []);

    const firstPersist = await service.persistUnlockedVault(
      values.vaultId,
      unlockedVault,
      { [values.deviceId]: 1 },
    );
    const firstPreparedRestore = await service.prepareLocalVaultSnapshotRestore(
      firstPersist.snapshot,
      unlockedVault,
    );
    const secondPersist = await service.persistUnlockedVault(
      values.vaultId,
      {
        ...unlockedVault,
        trustedSnapshotContext: firstPersist.trustedSnapshotContext,
      },
      firstPersist.snapshotVersionVector,
    );

    expect(secondPersist.trustedSnapshotContext.snapshotDigest).not.toBe(
      firstPersist.trustedSnapshotContext.snapshotDigest,
    );
    expect(ports.saved.vaultSnapshotDigest).toBe(
      secondPersist.trustedSnapshotContext.snapshotDigest,
    );
    expect(ports.saved.localVaultTrustCheckpoint?.payload).toMatchObject({
      snapshotVersionVector: secondPersist.snapshotVersionVector,
      snapshotDigest: secondPersist.trustedSnapshotContext.snapshotDigest,
    });
    expect(ports.saved.vaultSnapshot?.metadata.snapshotVersionVector).toEqual(
      secondPersist.snapshotVersionVector,
    );

    await service.restorePreparedLocalVaultSnapshot(
      firstPreparedRestore,
      secondPersist.trustedSnapshotContext.snapshotDigest,
      secondPersist.checkpoint,
    );

    expect(ports.saved.vaultSnapshot).toBe(firstPersist.snapshot);
    expect(ports.saved.vaultSnapshotDigest).toBe(
      firstPersist.trustedSnapshotContext.snapshotDigest,
    );
    expect(ports.saved.localVaultTrustCheckpoint).toBe(
      firstPreparedRestore.checkpoint,
    );
    expect(ports.saved.localVaultTrustCheckpoint?.payload).toMatchObject({
      snapshotVersionVector: firstPersist.snapshotVersionVector,
      snapshotDigest: firstPersist.trustedSnapshotContext.snapshotDigest,
    });
  });
});
