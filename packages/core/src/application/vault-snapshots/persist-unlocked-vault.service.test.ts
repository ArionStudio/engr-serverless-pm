import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import {
  createUnlockedVaultWithEntries,
  singlePasswordEntry,
  workTag,
} from "../../__tests__/fixtures/vault-entries";
import { CURRENT_ALGORITHM_SUITE } from "../../domain/crypto/algorithm-suite.const";
import type { VaultSnapshot } from "../../domain/snapshot/vault-snapshot";
import { UnsupportedAlgorithmSuiteError } from "../../use-cases/__errors/algorithm-suite.errors";
import {
  VaultSnapshotNotFoundError,
  VaultSnapshotSignerNotTrustedError,
} from "../../use-cases/__errors/unlock-vault.errors";
import { PersistedVaultMismatchError } from "../../use-cases/__errors/vault-snapshot.errors";
import { PersistUnlockedVaultService } from "./persist-unlocked-vault.service";

describe("PersistUnlockedVaultService", () => {
  function createContext() {
    const values = createCoreTestValues();
    const ports = createCoreTestPorts(values);
    const service = new PersistUnlockedVaultService(
      ports.crypto,
      ports.clock,
      ports.vaultLocalRepository,
    );
    const unlockedVault = createUnlockedVaultWithEntries(
      values,
      [singlePasswordEntry],
      [workTag],
    );
    const currentSnapshot: VaultSnapshot = {
      metadata: {
        id: values.vaultId,
        schemaVersion: 1,
        vaultCreationTimestamp: values.timestamp - 1_000,
        revisionTimestamp: values.timestamp - 500,
        revision: 3,
        algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
        createdByDeviceId: "previous-device-id",
      },
      trustedDevices: [
        {
          id: values.deviceId,
          publicKeys: {
            signingKey: values.devicePublicSignKey,
          },
        },
      ],
      keySlots: {
        deviceSlots: [
          {
            deviceId: values.deviceId,
            protectedVaultMasterKey: values.protectedDeviceVaultMasterKey,
          },
        ],
        recoveryKeySlot: {
          protectedVaultMasterKey: values.protectedRecoveryVaultMasterKey,
        },
      },
      content: values.encryptedVault,
      signature: values.snapshotSignature,
    };

    ports.saved.vaultSnapshot = currentSnapshot;

    return {
      values,
      ports,
      saved: ports.saved,
      service,
      unlockedVault,
      currentSnapshot,
    };
  }

  it("persists the unlocked vault as a new signed vault snapshot", async () => {
    const ctx = createContext();

    const result = await ctx.service.persist(
      ctx.values.vaultId,
      ctx.unlockedVault,
    );

    expect(result).toEqual({
      revision: 4,
      revisionTimestamp: ctx.values.timestamp,
      deviceId: ctx.values.deviceId,
    });
    expect(ctx.ports.crypto.encryptVaultSnapshotContent).toHaveBeenCalledWith(
      ctx.unlockedVault.vault,
      ctx.values.vaultMasterKey,
    );
    expect(ctx.ports.crypto.signVaultSnapshot).toHaveBeenCalledWith(
      {
        metadata: {
          ...ctx.currentSnapshot.metadata,
          revision: 4,
          revisionTimestamp: ctx.values.timestamp,
          createdByDeviceId: ctx.values.deviceId,
        },
        trustedDevices: ctx.currentSnapshot.trustedDevices,
        keySlots: ctx.currentSnapshot.keySlots,
        content: ctx.values.encryptedVault,
      },
      ctx.values.devicePrivateSignKey,
    );
    expect(ctx.saved.vaultSnapshot).toEqual({
      metadata: {
        ...ctx.currentSnapshot.metadata,
        revision: 4,
        revisionTimestamp: ctx.values.timestamp,
        createdByDeviceId: ctx.values.deviceId,
      },
      trustedDevices: ctx.currentSnapshot.trustedDevices,
      keySlots: ctx.currentSnapshot.keySlots,
      content: ctx.values.encryptedVault,
      signature: ctx.values.snapshotSignature,
    });
  });

  it("fails when the unlocked vault belongs to another vault", async () => {
    const ctx = createContext();

    await expect(
      ctx.service.persist("another-vault-id", ctx.unlockedVault),
    ).rejects.toThrow(PersistedVaultMismatchError);

    expect(
      ctx.ports.vaultLocalRepository.getVaultSnapshot,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
  });

  it("fails when the current local vault snapshot is missing", async () => {
    const ctx = createContext();
    ctx.saved.vaultSnapshot = undefined;

    await expect(
      ctx.service.persist(ctx.values.vaultId, ctx.unlockedVault),
    ).rejects.toThrow(VaultSnapshotNotFoundError);

    expect(ctx.ports.crypto.encryptVaultSnapshotContent).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
  });

  it("fails when the current local vault snapshot uses an unsupported algorithm suite", async () => {
    const ctx = createContext();
    ctx.saved.vaultSnapshot = {
      ...ctx.currentSnapshot,
      metadata: {
        ...ctx.currentSnapshot.metadata,
        algorithmSuiteId: "unsupported-suite",
      },
    };

    await expect(
      ctx.service.persist(ctx.values.vaultId, ctx.unlockedVault),
    ).rejects.toThrow(UnsupportedAlgorithmSuiteError);

    expect(ctx.ports.crypto.encryptVaultSnapshotContent).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
  });

  it("fails when the current device is not trusted by the snapshot", async () => {
    const ctx = createContext();
    ctx.saved.vaultSnapshot = {
      ...ctx.currentSnapshot,
      trustedDevices: [],
    };

    await expect(
      ctx.service.persist(ctx.values.vaultId, ctx.unlockedVault),
    ).rejects.toThrow(VaultSnapshotSignerNotTrustedError);

    expect(ctx.ports.crypto.encryptVaultSnapshotContent).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
  });

  it("does not save a snapshot when content encryption fails", async () => {
    const ctx = createContext();
    const error = new Error("encryption failed");

    vi.mocked(
      ctx.ports.crypto.encryptVaultSnapshotContent,
    ).mockRejectedValueOnce(error);

    await expect(
      ctx.service.persist(ctx.values.vaultId, ctx.unlockedVault),
    ).rejects.toThrow(error);

    expect(ctx.ports.crypto.signVaultSnapshot).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
  });

  it("does not save a snapshot when signing fails", async () => {
    const ctx = createContext();
    const error = new Error("signing failed");

    vi.mocked(ctx.ports.crypto.signVaultSnapshot).mockRejectedValueOnce(error);

    await expect(
      ctx.service.persist(ctx.values.vaultId, ctx.unlockedVault),
    ).rejects.toThrow(error);

    expect(ctx.ports.crypto.encryptVaultSnapshotContent).toHaveBeenCalledWith(
      ctx.unlockedVault.vault,
      ctx.values.vaultMasterKey,
    );
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
  });
});
