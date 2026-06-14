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
import { UnsupportedAlgorithmSuiteError } from "../../errors/algorithm-suite.errors";
import {
  VaultSnapshotNotFoundError,
  VaultSnapshotSignatureVerificationFailedError,
  VaultSnapshotSignerNotTrustedError,
} from "../../errors/unlock-vault.errors";
import {
  PersistedVaultMismatchError,
  SnapshotSigningDeviceNotTrustedError,
  VaultSnapshotVersionMismatchError,
} from "../../errors/vault-snapshot.errors";
import { VaultSnapshotService } from "./vault-snapshot.service";

describe("VaultSnapshotService", () => {
  const previousDeviceId = "previous-device-id";

  function createContext() {
    const values = createCoreTestValues();
    const ports = createCoreTestPorts(values);
    const service = new VaultSnapshotService(
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
        snapshotVersionVector: {
          [values.deviceId]: 3,
        },
        algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
        createdByDeviceId: previousDeviceId,
      },
      keySlots: {
        deviceSlots: [
          {
            deviceId: previousDeviceId,
            protectedVaultMasterKey: values.protectedDeviceVaultMasterKey,
            publicSignKey: values.devicePublicSignKey,
          },
          {
            deviceId: values.deviceId,
            protectedVaultMasterKey: values.protectedDeviceVaultMasterKey,
            publicSignKey: values.devicePublicSignKey,
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

    const result = await ctx.service.persistUnlockedVault(
      ctx.values.vaultId,
      ctx.unlockedVault,
      ctx.currentSnapshot.metadata.snapshotVersionVector,
    );

    expect(result).toEqual({
      snapshotVersionVector: {
        [ctx.values.deviceId]: 4,
      },
      revisionTimestamp: ctx.values.timestamp,
    });
    expect(ctx.ports.crypto.encryptVaultSnapshotContent).toHaveBeenCalledWith(
      ctx.unlockedVault.vault,
      ctx.values.vaultMasterKey,
    );
    expect(ctx.ports.crypto.signVaultSnapshot).toHaveBeenCalledWith(
      {
        metadata: {
          ...ctx.currentSnapshot.metadata,
          revisionTimestamp: ctx.values.timestamp,
          snapshotVersionVector: {
            [ctx.values.deviceId]: 4,
          },
          createdByDeviceId: ctx.values.deviceId,
        },
        keySlots: ctx.currentSnapshot.keySlots,
        content: ctx.values.encryptedVault,
      },
      ctx.values.devicePrivateSignKey,
    );
    expect(ctx.saved.vaultSnapshot).toEqual({
      metadata: {
        ...ctx.currentSnapshot.metadata,
        revisionTimestamp: ctx.values.timestamp,
        snapshotVersionVector: {
          [ctx.values.deviceId]: 4,
        },
        createdByDeviceId: ctx.values.deviceId,
      },
      keySlots: ctx.currentSnapshot.keySlots,
      content: ctx.values.encryptedVault,
      signature: ctx.values.snapshotSignature,
    });
  });

  it("requires the current snapshot for an unlocked vault without saving", async () => {
    const ctx = createContext();

    await expect(
      ctx.service.requireCurrentSnapshotForUnlockedVault(
        ctx.values.vaultId,
        ctx.unlockedVault,
        ctx.currentSnapshot.metadata.snapshotVersionVector,
      ),
    ).resolves.toBe(ctx.currentSnapshot);

    expect(ctx.ports.crypto.encryptVaultSnapshotContent).not.toHaveBeenCalled();
    expect(ctx.ports.crypto.signVaultSnapshot).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
  });

  it("requires a local vault snapshot", async () => {
    const ctx = createContext();

    await expect(
      ctx.service.requireLocalVaultSnapshot(ctx.values.vaultId),
    ).resolves.toBe(ctx.currentSnapshot);
  });

  it("opens a vault snapshot only after trusted signer verification", async () => {
    const ctx = createContext();
    const trustedSnapshot: VaultSnapshot = {
      ...ctx.currentSnapshot,
      metadata: {
        ...ctx.currentSnapshot.metadata,
        createdByDeviceId: ctx.values.deviceId,
      },
    };

    await expect(
      ctx.service.openTrustedVaultSnapshot(
        ctx.values.vaultId,
        trustedSnapshot,
        ctx.values.vaultMasterKey,
        ctx.currentSnapshot,
      ),
    ).resolves.toBe(ctx.values.decryptedVault);

    expect(ctx.ports.crypto.verifyVaultSnapshotSignature).toHaveBeenCalledWith(
      trustedSnapshot,
      ctx.values.devicePublicSignKey,
    );
    expect(ctx.ports.crypto.decryptVaultSnapshotContent).toHaveBeenCalledWith(
      trustedSnapshot.content,
      ctx.values.vaultMasterKey,
    );
  });

  it("fails before decrypting when the snapshot signer is not trusted", async () => {
    const ctx = createContext();
    const untrustedSnapshot: VaultSnapshot = {
      ...ctx.currentSnapshot,
      metadata: {
        ...ctx.currentSnapshot.metadata,
        createdByDeviceId: "untrusted-device-id",
      },
    };

    await expect(
      ctx.service.openTrustedVaultSnapshot(
        ctx.values.vaultId,
        untrustedSnapshot,
        ctx.values.vaultMasterKey,
        ctx.currentSnapshot,
      ),
    ).rejects.toThrow(VaultSnapshotSignerNotTrustedError);

    expect(
      ctx.ports.crypto.verifyVaultSnapshotSignature,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.crypto.decryptVaultSnapshotContent).not.toHaveBeenCalled();
  });

  it("fails before decrypting when the snapshot signature is invalid", async () => {
    const ctx = createContext();
    const trustedSnapshot: VaultSnapshot = {
      ...ctx.currentSnapshot,
      metadata: {
        ...ctx.currentSnapshot.metadata,
        createdByDeviceId: ctx.values.deviceId,
      },
    };

    vi.mocked(
      ctx.ports.crypto.verifyVaultSnapshotSignature,
    ).mockResolvedValueOnce(false);

    await expect(
      ctx.service.openTrustedVaultSnapshot(
        ctx.values.vaultId,
        trustedSnapshot,
        ctx.values.vaultMasterKey,
        ctx.currentSnapshot,
      ),
    ).rejects.toThrow(VaultSnapshotSignatureVerificationFailedError);

    expect(ctx.ports.crypto.decryptVaultSnapshotContent).not.toHaveBeenCalled();
  });

  it("fails before verifying when the snapshot algorithm suite is unsupported", async () => {
    const ctx = createContext();
    const unsupportedSnapshot: VaultSnapshot = {
      ...ctx.currentSnapshot,
      metadata: {
        ...ctx.currentSnapshot.metadata,
        algorithmSuiteId: "unsupported-suite",
      },
    };

    await expect(
      ctx.service.openTrustedVaultSnapshot(
        ctx.values.vaultId,
        unsupportedSnapshot,
        ctx.values.vaultMasterKey,
        ctx.currentSnapshot,
      ),
    ).rejects.toThrow(UnsupportedAlgorithmSuiteError);

    expect(
      ctx.ports.crypto.verifyVaultSnapshotSignature,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.crypto.decryptVaultSnapshotContent).not.toHaveBeenCalled();
  });

  it("fails when the required current snapshot version does not match the session source version", async () => {
    const ctx = createContext();

    await expect(
      ctx.service.requireCurrentSnapshotForUnlockedVault(
        ctx.values.vaultId,
        ctx.unlockedVault,
        { [ctx.values.deviceId]: 2 },
      ),
    ).rejects.toThrow(VaultSnapshotVersionMismatchError);

    expect(ctx.ports.crypto.encryptVaultSnapshotContent).not.toHaveBeenCalled();
    expect(ctx.ports.crypto.signVaultSnapshot).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
  });

  it("fails when the unlocked vault belongs to another vault", async () => {
    const ctx = createContext();

    await expect(
      ctx.service.persistUnlockedVault(
        "another-vault-id",
        ctx.unlockedVault,
        ctx.currentSnapshot.metadata.snapshotVersionVector,
      ),
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
      ctx.service.persistUnlockedVault(
        ctx.values.vaultId,
        ctx.unlockedVault,
        ctx.currentSnapshot.metadata.snapshotVersionVector,
      ),
    ).rejects.toThrow(VaultSnapshotNotFoundError);

    expect(ctx.ports.crypto.encryptVaultSnapshotContent).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
  });

  it("fails when the current local snapshot version does not match the session source version", async () => {
    const ctx = createContext();

    await expect(
      ctx.service.persistUnlockedVault(ctx.values.vaultId, ctx.unlockedVault, {
        [ctx.values.deviceId]: 2,
      }),
    ).rejects.toThrow(VaultSnapshotVersionMismatchError);

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
      ctx.service.persistUnlockedVault(
        ctx.values.vaultId,
        ctx.unlockedVault,
        ctx.currentSnapshot.metadata.snapshotVersionVector,
      ),
    ).rejects.toThrow(UnsupportedAlgorithmSuiteError);

    expect(ctx.ports.crypto.encryptVaultSnapshotContent).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
  });

  it("fails when the current local snapshot signer is not trusted", async () => {
    const ctx = createContext();
    ctx.saved.vaultSnapshot = {
      ...ctx.currentSnapshot,
      keySlots: {
        ...ctx.currentSnapshot.keySlots,
        deviceSlots: ctx.currentSnapshot.keySlots.deviceSlots.filter(
          (deviceSlot) => deviceSlot.deviceId !== previousDeviceId,
        ),
      },
    };

    await expect(
      ctx.service.persistUnlockedVault(
        ctx.values.vaultId,
        ctx.unlockedVault,
        ctx.currentSnapshot.metadata.snapshotVersionVector,
      ),
    ).rejects.toThrow(VaultSnapshotSignerNotTrustedError);

    expect(
      ctx.ports.crypto.verifyVaultSnapshotSignature,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.crypto.encryptVaultSnapshotContent).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
  });

  it("fails when the current local snapshot signature is invalid", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.crypto.verifyVaultSnapshotSignature,
    ).mockResolvedValueOnce(false);

    await expect(
      ctx.service.persistUnlockedVault(
        ctx.values.vaultId,
        ctx.unlockedVault,
        ctx.currentSnapshot.metadata.snapshotVersionVector,
      ),
    ).rejects.toThrow(VaultSnapshotSignatureVerificationFailedError);

    expect(ctx.ports.crypto.encryptVaultSnapshotContent).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
  });

  it("fails when the current device is not trusted by the snapshot", async () => {
    const ctx = createContext();
    ctx.saved.vaultSnapshot = {
      ...ctx.currentSnapshot,
      keySlots: {
        ...ctx.currentSnapshot.keySlots,
        deviceSlots: ctx.currentSnapshot.keySlots.deviceSlots.filter(
          (deviceSlot) => deviceSlot.deviceId !== ctx.values.deviceId,
        ),
      },
    };

    await expect(
      ctx.service.persistUnlockedVault(
        ctx.values.vaultId,
        ctx.unlockedVault,
        ctx.currentSnapshot.metadata.snapshotVersionVector,
      ),
    ).rejects.toThrow(SnapshotSigningDeviceNotTrustedError);

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
      ctx.service.persistUnlockedVault(
        ctx.values.vaultId,
        ctx.unlockedVault,
        ctx.currentSnapshot.metadata.snapshotVersionVector,
      ),
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
      ctx.service.persistUnlockedVault(
        ctx.values.vaultId,
        ctx.unlockedVault,
        ctx.currentSnapshot.metadata.snapshotVersionVector,
      ),
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
