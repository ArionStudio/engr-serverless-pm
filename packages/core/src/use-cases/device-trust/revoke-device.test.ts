import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import {
  bytes,
  createCoreTestValues,
  type CoreTestValues,
} from "../../__tests__/fixtures/values";
import { UnsupportedAlgorithmSuiteError } from "../../application/errors/algorithm-suite.errors";
import {
  DeviceKeySlotNotFoundError,
  VaultSnapshotNotFoundError,
  VaultSnapshotSignatureVerificationFailedError,
  VaultSnapshotSignerNotTrustedError,
} from "../../application/errors/unlock-vault.errors";
import { VaultMustBeUnlockedError } from "../../application/errors/vault-session.errors";
import { VaultSnapshotRevisionMismatchError } from "../../application/errors/vault-snapshot.errors";
import { VaultSnapshotService } from "../../application/vault-snapshots/vault-snapshot.service";
import { CURRENT_ALGORITHM_SUITE } from "../../domain/crypto/algorithm-suite.const";
import type { DevicePublicSignKey } from "../../domain/device/brand-keys";
import type { VaultSnapshot } from "../../domain/snapshot/vault-snapshot";
import type { Vault } from "../../domain/vault/vault";
import {
  CannotRevokeCurrentDeviceError,
  DeviceProfileNotFoundForRevocationError,
  DeviceToRevokeNotTrustedError,
} from "./revoke-device.errors";
import { RevokeDeviceUseCase } from "./revoke-device";

const revokedDeviceId = "revoked-device-id";
const revokedDevicePublicSignKey = bytes<DevicePublicSignKey>();

function createVault(values: CoreTestValues): Vault {
  return {
    ...values.decryptedVault,
    versionVector: {
      [values.deviceId]: 1,
      [revokedDeviceId]: 1,
    },
    deviceProfiles: [
      {
        id: values.deviceId,
        name: "Current laptop",
        createdAt: values.timestamp - 2,
        versionVector: {
          [values.deviceId]: 1,
        },
      },
      {
        id: revokedDeviceId,
        name: "Old laptop",
        createdAt: values.timestamp - 1,
        versionVector: {
          [revokedDeviceId]: 1,
        },
      },
    ],
  };
}

function createVaultSnapshot(values: CoreTestValues): VaultSnapshot {
  return {
    metadata: {
      id: values.vaultId,
      schemaVersion: 1,
      vaultCreationTimestamp: values.timestamp - 10,
      revisionTimestamp: values.timestamp - 1,
      revision: 1,
      algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
      createdByDeviceId: values.deviceId,
    },
    trustedDevices: [
      {
        id: values.deviceId,
        publicKeys: {
          signingKey: values.devicePublicSignKey,
        },
      },
      {
        id: revokedDeviceId,
        publicKeys: {
          signingKey: revokedDevicePublicSignKey,
        },
      },
    ],
    keySlots: {
      deviceSlots: [
        {
          deviceId: values.deviceId,
          protectedVaultMasterKey: values.protectedDeviceVaultMasterKey,
        },
        {
          deviceId: revokedDeviceId,
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
}

function createContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  const snapshotService = new VaultSnapshotService(
    ports.crypto,
    ports.clock,
    ports.vaultLocalRepository,
  );
  const vault = createVault(values);
  const vaultSnapshot = createVaultSnapshot(values);

  ports.saved.vaultSnapshot = vaultSnapshot;
  ports.saved.unlockedVaultSession = {
    unlockedVault: {
      vaultId: values.vaultId,
      deviceId: values.deviceId,
      vault,
      vaultMasterKey: values.vaultMasterKey,
      devicePrivateSignKey: values.devicePrivateSignKey,
    },
    sourceSnapshotRevision: vaultSnapshot.metadata.revision,
  };

  return {
    values,
    ports,
    saved: ports.saved,
    vault,
    vaultSnapshot,
    snapshotService,
    useCase: new RevokeDeviceUseCase(
      ports.clock,
      ports.crypto,
      ports.sessionServices.unlockedVaultSession,
      ports.vaultLocalRepository,
      snapshotService,
    ),
  };
}

describe("RevokeDeviceUseCase", () => {
  it("revokes a trusted device and persists the updated trust snapshot", async () => {
    const ctx = createContext();

    const result = await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      deviceId: revokedDeviceId,
    });

    const expectedVault: Vault = {
      ...ctx.vault,
      versionVector: {
        [ctx.values.deviceId]: 2,
        [revokedDeviceId]: 1,
      },
      deviceProfiles: [
        {
          id: ctx.values.deviceId,
          name: "Current laptop",
          createdAt: ctx.values.timestamp - 2,
          versionVector: {
            [ctx.values.deviceId]: 1,
          },
        },
      ],
      deletedDeviceProfiles: [
        {
          id: revokedDeviceId,
          versionVector: {
            [revokedDeviceId]: 1,
            [ctx.values.deviceId]: 1,
          },
          deletedAt: ctx.values.timestamp,
        },
      ],
    };

    expect(result).toEqual({
      vault: expectedVault,
      revision: 2,
      revisionTimestamp: ctx.values.timestamp,
      deviceId: ctx.values.deviceId,
    });
    expect(ctx.ports.crypto.verifyVaultSnapshotSignature).toHaveBeenCalledWith(
      ctx.vaultSnapshot,
      ctx.values.devicePublicSignKey,
    );
    expect(ctx.ports.crypto.encryptVaultSnapshotContent).toHaveBeenCalledWith(
      expectedVault,
      ctx.values.vaultMasterKey,
    );
    expect(ctx.saved.vaultSnapshot).toEqual({
      metadata: {
        ...ctx.vaultSnapshot.metadata,
        revision: 2,
        revisionTimestamp: ctx.values.timestamp,
        createdByDeviceId: ctx.values.deviceId,
      },
      trustedDevices: [
        {
          id: ctx.values.deviceId,
          publicKeys: {
            signingKey: ctx.values.devicePublicSignKey,
          },
        },
      ],
      keySlots: {
        deviceSlots: [
          {
            deviceId: ctx.values.deviceId,
            protectedVaultMasterKey: ctx.values.protectedDeviceVaultMasterKey,
          },
        ],
        recoveryKeySlot: ctx.vaultSnapshot.keySlots.recoveryKeySlot,
      },
      content: ctx.values.encryptedVault,
      signature: ctx.values.snapshotSignature,
    });
    expect(ctx.ports.crypto.signVaultSnapshot).toHaveBeenCalledWith(
      {
        metadata: ctx.saved.vaultSnapshot?.metadata,
        trustedDevices: ctx.saved.vaultSnapshot?.trustedDevices,
        keySlots: ctx.saved.vaultSnapshot?.keySlots,
        content: ctx.saved.vaultSnapshot?.content,
      },
      ctx.values.devicePrivateSignKey,
    );
    expect(ctx.saved.unlockedVaultSession).toEqual({
      unlockedVault: {
        vaultId: ctx.values.vaultId,
        deviceId: ctx.values.deviceId,
        vault: expectedVault,
        vaultMasterKey: ctx.values.vaultMasterKey,
        devicePrivateSignKey: ctx.values.devicePrivateSignKey,
      },
      sourceSnapshotRevision: 2,
    });
    expect(
      vi.mocked(ctx.ports.vaultLocalRepository.saveVaultSnapshot).mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(ctx.ports.sessionServices.unlockedVaultSession.commit).mock
        .invocationCallOrder[0],
    );
  });

  it("fails when the target vault is not unlocked", async () => {
    const ctx = createContext();
    ctx.saved.unlockedVaultSession = undefined;

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        deviceId: revokedDeviceId,
      }),
    ).rejects.toBeInstanceOf(VaultMustBeUnlockedError);

    expect(
      ctx.ports.vaultLocalRepository.getVaultSnapshot,
    ).not.toHaveBeenCalled();
  });

  it("fails when another vault is unlocked", async () => {
    const ctx = createContext();
    ctx.saved.unlockedVaultSession = {
      unlockedVault: {
        vaultId: "another-vault-id",
        deviceId: ctx.values.deviceId,
        vault: ctx.vault,
        vaultMasterKey: ctx.values.vaultMasterKey,
        devicePrivateSignKey: ctx.values.devicePrivateSignKey,
      },
      sourceSnapshotRevision: ctx.vaultSnapshot.metadata.revision,
    };

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        deviceId: revokedDeviceId,
      }),
    ).rejects.toBeInstanceOf(VaultMustBeUnlockedError);

    expect(
      ctx.ports.vaultLocalRepository.getVaultSnapshot,
    ).not.toHaveBeenCalled();
  });

  it("fails before snapshot reads when revoking the current device", async () => {
    const ctx = createContext();

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        deviceId: ctx.values.deviceId,
      }),
    ).rejects.toBeInstanceOf(CannotRevokeCurrentDeviceError);

    expect(
      ctx.ports.vaultLocalRepository.getVaultSnapshot,
    ).not.toHaveBeenCalled();
  });

  it("fails when vault snapshot is missing", async () => {
    const ctx = createContext();
    ctx.saved.vaultSnapshot = undefined;

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        deviceId: revokedDeviceId,
      }),
    ).rejects.toBeInstanceOf(VaultSnapshotNotFoundError);

    expect(
      ctx.ports.crypto.verifyVaultSnapshotSignature,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
  });

  it("fails when the local snapshot revision no longer matches the unlocked session", async () => {
    const ctx = createContext();
    ctx.saved.vaultSnapshot = {
      ...ctx.vaultSnapshot,
      metadata: {
        ...ctx.vaultSnapshot.metadata,
        revision: ctx.vaultSnapshot.metadata.revision + 1,
      },
    };

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        deviceId: revokedDeviceId,
      }),
    ).rejects.toBeInstanceOf(VaultSnapshotRevisionMismatchError);

    expect(
      ctx.ports.crypto.verifyVaultSnapshotSignature,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
  });

  it("fails when vault snapshot uses unsupported algorithm suite", async () => {
    const ctx = createContext();
    ctx.saved.vaultSnapshot = {
      ...ctx.vaultSnapshot,
      metadata: {
        ...ctx.vaultSnapshot.metadata,
        algorithmSuiteId: "spm-unsupported",
      },
    };

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        deviceId: revokedDeviceId,
      }),
    ).rejects.toBeInstanceOf(UnsupportedAlgorithmSuiteError);

    expect(
      ctx.ports.crypto.verifyVaultSnapshotSignature,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
  });

  it("fails when the snapshot signer is not trusted", async () => {
    const ctx = createContext();
    ctx.saved.vaultSnapshot = {
      ...ctx.vaultSnapshot,
      metadata: {
        ...ctx.vaultSnapshot.metadata,
        createdByDeviceId: "untrusted-signer-id",
      },
    };

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        deviceId: revokedDeviceId,
      }),
    ).rejects.toBeInstanceOf(VaultSnapshotSignerNotTrustedError);

    expect(
      ctx.ports.crypto.verifyVaultSnapshotSignature,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
  });

  it("fails when snapshot signature verification fails", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.crypto.verifyVaultSnapshotSignature,
    ).mockResolvedValueOnce(false);

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        deviceId: revokedDeviceId,
      }),
    ).rejects.toBeInstanceOf(VaultSnapshotSignatureVerificationFailedError);

    expect(ctx.ports.crypto.encryptVaultSnapshotContent).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
  });

  it("fails when the current device is no longer trusted", async () => {
    const ctx = createContext();
    ctx.saved.vaultSnapshot = {
      ...ctx.vaultSnapshot,
      metadata: {
        ...ctx.vaultSnapshot.metadata,
        createdByDeviceId: revokedDeviceId,
      },
      trustedDevices: [
        {
          id: revokedDeviceId,
          publicKeys: {
            signingKey: revokedDevicePublicSignKey,
          },
        },
      ],
    };

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        deviceId: revokedDeviceId,
      }),
    ).rejects.toBeInstanceOf(VaultSnapshotSignerNotTrustedError);

    expect(ctx.ports.crypto.encryptVaultSnapshotContent).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
  });

  it("fails when the target device is not trusted", async () => {
    const ctx = createContext();
    ctx.saved.vaultSnapshot = {
      ...ctx.vaultSnapshot,
      trustedDevices: [
        {
          id: ctx.values.deviceId,
          publicKeys: {
            signingKey: ctx.values.devicePublicSignKey,
          },
        },
      ],
    };

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        deviceId: revokedDeviceId,
      }),
    ).rejects.toBeInstanceOf(DeviceToRevokeNotTrustedError);

    expect(ctx.ports.crypto.encryptVaultSnapshotContent).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
  });

  it("fails when the target device key slot is missing", async () => {
    const ctx = createContext();
    ctx.saved.vaultSnapshot = {
      ...ctx.vaultSnapshot,
      keySlots: {
        ...ctx.vaultSnapshot.keySlots,
        deviceSlots: ctx.vaultSnapshot.keySlots.deviceSlots.filter(
          (deviceSlot) => deviceSlot.deviceId !== revokedDeviceId,
        ),
      },
    };

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        deviceId: revokedDeviceId,
      }),
    ).rejects.toBeInstanceOf(DeviceKeySlotNotFoundError);

    expect(ctx.ports.crypto.encryptVaultSnapshotContent).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
  });

  it("fails when the target device profile is missing", async () => {
    const ctx = createContext();
    ctx.saved.unlockedVaultSession = {
      unlockedVault: {
        vaultId: ctx.values.vaultId,
        deviceId: ctx.values.deviceId,
        vault: {
          ...ctx.vault,
          deviceProfiles: ctx.vault.deviceProfiles.filter(
            (deviceProfile) => deviceProfile.id !== revokedDeviceId,
          ),
        },
        vaultMasterKey: ctx.values.vaultMasterKey,
        devicePrivateSignKey: ctx.values.devicePrivateSignKey,
      },
      sourceSnapshotRevision: ctx.vaultSnapshot.metadata.revision,
    };

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        deviceId: revokedDeviceId,
      }),
    ).rejects.toBeInstanceOf(DeviceProfileNotFoundForRevocationError);

    expect(ctx.ports.crypto.encryptVaultSnapshotContent).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
  });

  it("does not commit the session when snapshot persistence fails", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).mockRejectedValueOnce(new Error("snapshot save failed"));

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        deviceId: revokedDeviceId,
      }),
    ).rejects.toThrow("snapshot save failed");

    expect(
      ctx.ports.sessionServices.unlockedVaultSession.commit,
    ).not.toHaveBeenCalled();
    expect(ctx.saved.vaultSnapshot).toEqual(ctx.vaultSnapshot);
    expect(ctx.saved.unlockedVaultSession?.unlockedVault.vault).toEqual(
      ctx.vault,
    );
  });

  it("invalidates the session when session commit fails after snapshot persistence", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.sessionServices.unlockedVaultSession.commit,
    ).mockRejectedValueOnce(new Error("session save failed"));

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        deviceId: revokedDeviceId,
      }),
    ).rejects.toThrow("session save failed");

    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).toHaveBeenCalledTimes(1);
    expect(
      ctx.ports.sessionServices.unlockedVaultSession.remove,
    ).toHaveBeenCalled();
    expect(ctx.saved.unlockedVaultSession).toBeUndefined();
  });
});
