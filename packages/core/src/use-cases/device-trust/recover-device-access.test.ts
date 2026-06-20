import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import { CURRENT_ALGORITHM_SUITE } from "../../domain/crypto/algorithm-suite.const";
import type { DeviceAccessRecoveryBackup } from "../../domain/device-trust/device-access-recovery-backup";
import type { VaultSnapshot } from "../../domain/snapshot/vault-snapshot";
import { UnsupportedAlgorithmSuiteError } from "../../errors/algorithm-suite.errors";
import {
  DeviceKeySlotNotFoundError,
  DeviceKeySlotVerificationFailedError,
  VaultSnapshotNotFoundError,
  VaultSnapshotSignatureVerificationFailedError,
  VaultSnapshotSignerNotTrustedError,
} from "../../errors/unlock-vault.errors";
import { ActiveUnlockedVaultMismatchError } from "../../errors/vault-session.errors";
import { PersistedVaultMismatchError } from "../../errors/vault-snapshot.errors";
import {
  DeviceAccessRecoveryBackupMismatchError,
  DeviceAccessRecoveryBackupNotFoundError,
} from "./recover-device-access.errors";
import { RecoverDeviceAccessUseCase } from "./recover-device-access";

function createContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  const vaultSnapshot: VaultSnapshot = {
    metadata: {
      id: values.vaultId,
      schemaVersion: 1,
      vaultCreationTimestamp: values.timestamp - 1_000,
      revisionTimestamp: values.timestamp,
      snapshotVersionVector: {
        [values.deviceId]: 1,
      },
      algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
      createdByDeviceId: values.deviceId,
    },
    keySlots: {
      deviceSlots: [
        {
          deviceId: values.deviceId,
          protectedVaultMasterKey: values.protectedDeviceVaultMasterKey,
          publicSignKey: values.devicePublicSignKey,
        },
      ],
    },
    content: values.encryptedVault,
    signature: values.snapshotSignature,
  };
  const deviceAccessRecoveryBackup: DeviceAccessRecoveryBackup = {
    vaultId: values.vaultId,
    deviceId: values.deviceId,
    algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
    recoveryLocalKeysProtectionSalt: values.recoveryLocalKeysProtectionSalt,
    devicePublicSignKey: values.devicePublicSignKey,
    protectedLocalKeys: values.recoveryProtectedLocalKeys,
  };

  ports.saved.vaultSnapshot = vaultSnapshot;
  ports.saved.deviceAccessRecoveryBackup = deviceAccessRecoveryBackup;
  vi.mocked(ports.crypto.generateMasterPasswordSalt)
    .mockReset()
    .mockResolvedValue(values.newMasterPasswordSalt);
  vi.mocked(ports.crypto.deriveLocalRootKey)
    .mockReset()
    .mockResolvedValue(values.newLocalRootKey);
  vi.mocked(ports.crypto.generateLocalKeysProtectionSalt)
    .mockReset()
    .mockResolvedValue(values.newLocalKeysProtectionSalt);
  vi.mocked(ports.crypto.generateRecoveryKey)
    .mockReset()
    .mockResolvedValue(values.rotatedRecoverySecretKey);
  vi.mocked(ports.crypto.generateRecoveryLocalKeysProtectionSalt)
    .mockReset()
    .mockResolvedValue(values.rotatedRecoveryLocalKeysProtectionSalt);

  return {
    values,
    ports,
    vaultSnapshot,
    deviceAccessRecoveryBackup,
    useCase: new RecoverDeviceAccessUseCase(
      ports.bip39,
      ports.crypto,
      ports.sessionServices.unlockedVaultSession,
      ports.vaultLocalRepository,
    ),
  };
}

describe("RecoverDeviceAccessUseCase", () => {
  it("recovers device access material with a new master password", async () => {
    const ctx = createContext();

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
        newMasterPassword: ctx.values.newMasterPassword,
      }),
    ).resolves.toEqual({
      deviceId: ctx.values.deviceId,
      recoveryMnemonicKey: ctx.values.rotatedRecoveryMnemonicKey,
    });

    expect(ctx.ports.crypto.verifyVaultSnapshotSignature).toHaveBeenCalledWith(
      ctx.vaultSnapshot,
      ctx.values.devicePublicSignKey,
    );
    expect(ctx.ports.bip39.mnemonicToRecoveryKey).toHaveBeenCalledWith(
      ctx.values.recoveryMnemonicKey,
    );
    expect(
      ctx.ports.crypto.deriveRecoveryLocalKeysProtectionKey,
    ).toHaveBeenNthCalledWith(
      1,
      ctx.values.recoverySecretKey,
      ctx.values.recoveryLocalKeysProtectionSalt,
    );
    expect(ctx.ports.crypto.unwrapLocalKeysPayload).toHaveBeenCalledWith(
      ctx.values.recoveryProtectedLocalKeys,
      ctx.values.recoveryLocalKeysProtectionKey,
    );
    expect(ctx.ports.crypto.verifyDeviceSignKeyPair).toHaveBeenCalledWith(
      ctx.values.devicePublicSignKey,
      ctx.values.devicePrivateSignKey,
    );
    expect(
      ctx.ports.crypto.deriveDeviceSlotVaultMasterKeyProtectionKey,
    ).toHaveBeenCalledWith(ctx.values.deviceSlotKey);
    expect(ctx.ports.crypto.unwrapVaultMasterKey).toHaveBeenCalledWith(
      ctx.values.protectedDeviceVaultMasterKey,
      ctx.values.deviceSlotVaultMasterKeyProtectionKey,
    );
    expect(ctx.ports.crypto.decryptVaultSnapshotContent).toHaveBeenCalledWith(
      ctx.values.encryptedVault,
      ctx.values.vaultMasterKey,
    );
    expect(ctx.ports.crypto.deriveLocalRootKey).toHaveBeenCalledWith(
      ctx.values.newMasterPassword,
      ctx.values.newMasterPasswordSalt,
    );
    expect(ctx.ports.crypto.wrapLocalKeysPayload).toHaveBeenCalledWith(
      {
        deviceSlotKey: ctx.values.deviceSlotKey,
        devicePrivateSignKey: ctx.values.devicePrivateSignKey,
      },
      ctx.values.newLocalKeysProtectionKey,
    );
    expect(ctx.ports.crypto.generateRecoveryKey).toHaveBeenCalled();
    expect(ctx.ports.bip39.recoveryKeyToMnemonic).toHaveBeenCalledWith(
      ctx.values.rotatedRecoverySecretKey,
    );
    expect(
      ctx.ports.crypto.deriveRecoveryLocalKeysProtectionKey,
    ).toHaveBeenNthCalledWith(
      2,
      ctx.values.rotatedRecoverySecretKey,
      ctx.values.rotatedRecoveryLocalKeysProtectionSalt,
    );
    expect(ctx.ports.crypto.wrapLocalKeysPayload).toHaveBeenCalledWith(
      {
        deviceSlotKey: ctx.values.deviceSlotKey,
        devicePrivateSignKey: ctx.values.devicePrivateSignKey,
      },
      ctx.values.rotatedRecoveryLocalKeysProtectionKey,
    );
    expect(
      ctx.ports.vaultLocalRepository.saveRecoveredDeviceAccess,
    ).toHaveBeenCalledWith(
      {
        vaultId: ctx.values.vaultId,
        deviceId: ctx.values.deviceId,
        algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
        masterPasswordSalt: ctx.values.newMasterPasswordSalt,
        localKeysProtectionSalt: ctx.values.newLocalKeysProtectionSalt,
        devicePublicSignKey: ctx.values.devicePublicSignKey,
        protectedLocalKeys: ctx.values.reprotectedLocalKeys,
      },
      {
        vaultId: ctx.values.vaultId,
        deviceId: ctx.values.deviceId,
        algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
        recoveryLocalKeysProtectionSalt:
          ctx.values.rotatedRecoveryLocalKeysProtectionSalt,
        devicePublicSignKey: ctx.values.devicePublicSignKey,
        protectedLocalKeys: ctx.values.rotatedRecoveryProtectedLocalKeys,
      },
    );
    expect(ctx.ports.saved.deviceAccessMaterial).toEqual({
      vaultId: ctx.values.vaultId,
      deviceId: ctx.values.deviceId,
      algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
      masterPasswordSalt: ctx.values.newMasterPasswordSalt,
      localKeysProtectionSalt: ctx.values.newLocalKeysProtectionSalt,
      devicePublicSignKey: ctx.values.devicePublicSignKey,
      protectedLocalKeys: ctx.values.reprotectedLocalKeys,
    });
    expect(ctx.ports.saved.deviceAccessRecoveryBackup).toEqual({
      vaultId: ctx.values.vaultId,
      deviceId: ctx.values.deviceId,
      algorithmSuiteId: CURRENT_ALGORITHM_SUITE.id,
      recoveryLocalKeysProtectionSalt:
        ctx.values.rotatedRecoveryLocalKeysProtectionSalt,
      devicePublicSignKey: ctx.values.devicePublicSignKey,
      protectedLocalKeys: ctx.values.rotatedRecoveryProtectedLocalKeys,
    });
    expect(
      ctx.ports.vaultLocalRepository.saveDeviceAccessMaterial,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveDeviceAccessRecoveryBackup,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveVaultSnapshot,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.sessionServices.unlockedVaultSession.commit,
    ).not.toHaveBeenCalled();
  });

  it("fails before snapshot reads when the recovery backup is missing", async () => {
    const ctx = createContext();
    ctx.ports.saved.deviceAccessRecoveryBackup = undefined;

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
        newMasterPassword: ctx.values.newMasterPassword,
      }),
    ).rejects.toBeInstanceOf(DeviceAccessRecoveryBackupNotFoundError);

    expect(
      ctx.ports.vaultLocalRepository.getVaultSnapshot,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.bip39.mnemonicToRecoveryKey).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveRecoveredDeviceAccess,
    ).not.toHaveBeenCalled();
  });

  it("fails when another vault is active", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSession = {
      unlockedVault: {
        vaultId: "another-vault-id",
        deviceId: ctx.values.deviceId,
        vault: ctx.values.decryptedVault,
        vaultMasterKey: ctx.values.vaultMasterKey,
        devicePrivateSignKey: ctx.values.devicePrivateSignKey,
      },
      sourceSnapshotVersionVector: {
        [ctx.values.deviceId]: 1,
      },
    };

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
        newMasterPassword: ctx.values.newMasterPassword,
      }),
    ).rejects.toBeInstanceOf(ActiveUnlockedVaultMismatchError);

    expect(
      ctx.ports.vaultLocalRepository.getDeviceAccessRecoveryBackup,
    ).not.toHaveBeenCalled();
  });

  it("fails when the recovery backup belongs to another vault", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.vaultLocalRepository.getDeviceAccessRecoveryBackup,
    ).mockResolvedValueOnce({
      ...ctx.deviceAccessRecoveryBackup,
      vaultId: "another-vault-id",
    });

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
        newMasterPassword: ctx.values.newMasterPassword,
      }),
    ).rejects.toBeInstanceOf(DeviceAccessRecoveryBackupMismatchError);

    expect(
      ctx.ports.vaultLocalRepository.getVaultSnapshot,
    ).not.toHaveBeenCalled();
  });

  it("fails when the recovery backup algorithm is unsupported", async () => {
    const ctx = createContext();
    ctx.ports.saved.deviceAccessRecoveryBackup = {
      ...ctx.deviceAccessRecoveryBackup,
      algorithmSuiteId: "old-suite",
    };

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
        newMasterPassword: ctx.values.newMasterPassword,
      }),
    ).rejects.toBeInstanceOf(UnsupportedAlgorithmSuiteError);

    expect(
      ctx.ports.vaultLocalRepository.getVaultSnapshot,
    ).not.toHaveBeenCalled();
  });

  it("fails when the vault snapshot is missing", async () => {
    const ctx = createContext();
    ctx.ports.saved.vaultSnapshot = undefined;

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
        newMasterPassword: ctx.values.newMasterPassword,
      }),
    ).rejects.toBeInstanceOf(VaultSnapshotNotFoundError);

    expect(ctx.ports.bip39.mnemonicToRecoveryKey).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveRecoveredDeviceAccess,
    ).not.toHaveBeenCalled();
  });

  it("fails when the vault snapshot belongs to another vault", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.vaultLocalRepository.getVaultSnapshot,
    ).mockResolvedValueOnce({
      ...ctx.vaultSnapshot,
      metadata: {
        ...ctx.vaultSnapshot.metadata,
        id: "another-vault-id",
      },
    });

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
        newMasterPassword: ctx.values.newMasterPassword,
      }),
    ).rejects.toBeInstanceOf(PersistedVaultMismatchError);

    expect(ctx.ports.bip39.mnemonicToRecoveryKey).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveRecoveredDeviceAccess,
    ).not.toHaveBeenCalled();
  });

  it("fails when the snapshot signer is not trusted", async () => {
    const ctx = createContext();
    ctx.ports.saved.vaultSnapshot = {
      ...ctx.vaultSnapshot,
      metadata: {
        ...ctx.vaultSnapshot.metadata,
        createdByDeviceId: "unknown-device-id",
      },
    };

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
        newMasterPassword: ctx.values.newMasterPassword,
      }),
    ).rejects.toBeInstanceOf(VaultSnapshotSignerNotTrustedError);

    expect(ctx.ports.bip39.mnemonicToRecoveryKey).not.toHaveBeenCalled();
  });

  it("fails when the snapshot signature is invalid", async () => {
    const ctx = createContext();
    vi.mocked(
      ctx.ports.crypto.verifyVaultSnapshotSignature,
    ).mockResolvedValueOnce(false);

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
        newMasterPassword: ctx.values.newMasterPassword,
      }),
    ).rejects.toBeInstanceOf(VaultSnapshotSignatureVerificationFailedError);

    expect(ctx.ports.bip39.mnemonicToRecoveryKey).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveRecoveredDeviceAccess,
    ).not.toHaveBeenCalled();
  });

  it("fails when the recovered device is no longer trusted by the snapshot", async () => {
    const ctx = createContext();
    ctx.ports.saved.deviceAccessRecoveryBackup = {
      ...ctx.deviceAccessRecoveryBackup,
      deviceId: "revoked-device-id",
    };

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
        newMasterPassword: ctx.values.newMasterPassword,
      }),
    ).rejects.toBeInstanceOf(DeviceKeySlotNotFoundError);

    expect(ctx.ports.bip39.mnemonicToRecoveryKey).not.toHaveBeenCalled();
  });

  it("fails when the recovered private signing key does not match the device slot", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.crypto.verifyDeviceSignKeyPair).mockResolvedValueOnce(
      false,
    );

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
        newMasterPassword: ctx.values.newMasterPassword,
      }),
    ).rejects.toBeInstanceOf(DeviceKeySlotVerificationFailedError);

    expect(ctx.ports.crypto.unwrapVaultMasterKey).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveRecoveredDeviceAccess,
    ).not.toHaveBeenCalled();
  });

  it("fails when the recovered private signing key does not match the recovery backup public key", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.crypto.verifyDeviceSignKeyPair)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
        newMasterPassword: ctx.values.newMasterPassword,
      }),
    ).rejects.toBeInstanceOf(DeviceKeySlotVerificationFailedError);

    expect(ctx.ports.crypto.unwrapVaultMasterKey).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveRecoveredDeviceAccess,
    ).not.toHaveBeenCalled();
  });

  it("bubbles recovered device access save failures after proving the recovery keys", async () => {
    const ctx = createContext();
    const error = new Error("save failed");

    vi.mocked(
      ctx.ports.vaultLocalRepository.saveRecoveredDeviceAccess,
    ).mockRejectedValueOnce(error);

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
        newMasterPassword: ctx.values.newMasterPassword,
      }),
    ).rejects.toBe(error);

    expect(ctx.ports.crypto.decryptVaultSnapshotContent).toHaveBeenCalled();
  });
});
