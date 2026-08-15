import { describe, expect, it, vi } from "vitest";
import { createUnlockVaultTestContext } from "../../__tests__/fixtures/unlock-vault";
import type { DeviceAccessRecoveryBackup } from "../../domain/device-trust";
import {
  DeviceKeySlotNotFoundError,
  DeviceKeySlotVerificationFailedError,
} from "../../errors/unlock-vault.errors";
import { RecoverDeviceAccessUseCase } from "./recover-device-access";

function createContext() {
  const ctx = createUnlockVaultTestContext();
  const backup: DeviceAccessRecoveryBackup = {
    vaultId: ctx.values.vaultId,
    deviceId: ctx.values.deviceId,
    algorithmSuiteId: ctx.ports.crypto.algorithmSuite.id,
    recoveryLocalKeysProtectionSalt: ctx.values.recoveryLocalKeysProtectionSalt,
    devicePublicSignKey: ctx.values.devicePublicSignKey,
    devicePublicVaultKey: ctx.values.devicePublicVaultKey,
    protectedLocalKeys: ctx.values.recoveryProtectedLocalKeys,
  };
  ctx.saved.deviceAccessRecoveryBackup = backup;
  vi.mocked(ctx.ports.crypto.generateMasterPasswordSalt)
    .mockReset()
    .mockResolvedValue(ctx.values.newMasterPasswordSalt);
  vi.mocked(ctx.ports.crypto.deriveLocalRootKey)
    .mockReset()
    .mockResolvedValue(ctx.values.newLocalRootKey);
  vi.mocked(ctx.ports.crypto.generateLocalKeysProtectionSalt)
    .mockReset()
    .mockResolvedValue(ctx.values.newLocalKeysProtectionSalt);
  const useCase = new RecoverDeviceAccessUseCase(
    ctx.ports.bip39,
    ctx.ports.crypto,
    ctx.ports.sessionServices.unlockedVaultSession,
    ctx.ports.vaultLocalRepository,
  );

  return { ...ctx, backup, useCase };
}

describe("RecoverDeviceAccessUseCase", () => {
  it("replaces the current local backup without changing the trusted identity", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.crypto.generateRecoveryKey).mockResolvedValueOnce(
      ctx.values.rotatedRecoverySecretKey,
    );
    vi.mocked(
      ctx.ports.crypto.generateRecoveryLocalKeysProtectionSalt,
    ).mockResolvedValueOnce(ctx.values.rotatedRecoveryLocalKeysProtectionSalt);

    const result = await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
      newMasterPassword: ctx.values.newMasterPassword,
    });

    expect(result).toEqual({
      deviceId: ctx.values.deviceId,
      recoveryMnemonicKey: ctx.values.rotatedRecoveryMnemonicKey,
    });
    expect(ctx.ports.crypto.verifyDeviceVaultKeyPair).toHaveBeenCalledWith(
      ctx.values.devicePublicVaultKey,
      ctx.values.devicePrivateVaultKey,
    );
    expect(ctx.ports.crypto.openDeviceVaultKeyEnvelope).toHaveBeenCalled();
    expect(
      ctx.ports.crypto.deriveRecoveryLocalKeysProtectionKey,
    ).toHaveBeenNthCalledWith(
      2,
      ctx.values.rotatedRecoverySecretKey,
      ctx.values.rotatedRecoveryLocalKeysProtectionSalt,
    );
    const recoveredLocalKeysPayload = {
      devicePrivateSignKey: ctx.values.devicePrivateSignKey,
      devicePrivateVaultKey: ctx.values.devicePrivateVaultKey,
      deviceLocalProtectionKey: ctx.values.deviceLocalProtectionKey,
      vaultTrustAnchor: ctx.values.vaultTrustAnchor,
    };
    expect(ctx.ports.crypto.wrapLocalKeysPayload).toHaveBeenNthCalledWith(
      1,
      recoveredLocalKeysPayload,
      ctx.values.newLocalKeysProtectionKey,
    );
    expect(ctx.ports.crypto.wrapLocalKeysPayload).toHaveBeenNthCalledWith(
      2,
      recoveredLocalKeysPayload,
      ctx.values.rotatedRecoveryLocalKeysProtectionKey,
    );
    expect(
      ctx.ports.vaultLocalRepository.saveRecoveredDeviceAccess,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceId: ctx.values.deviceId,
        masterPasswordSalt: ctx.values.newMasterPasswordSalt,
        localKeysProtectionSalt: ctx.values.newLocalKeysProtectionSalt,
        devicePublicSignKey: ctx.values.devicePublicSignKey,
        devicePublicVaultKey: ctx.values.devicePublicVaultKey,
        protectedLocalKeys: ctx.values.reprotectedLocalKeys,
      }),
      expect.objectContaining({
        deviceId: ctx.values.deviceId,
        recoveryLocalKeysProtectionSalt:
          ctx.values.rotatedRecoveryLocalKeysProtectionSalt,
        devicePublicSignKey: ctx.values.devicePublicSignKey,
        devicePublicVaultKey: ctx.values.devicePublicVaultKey,
        protectedLocalKeys: ctx.values.rotatedRecoveryProtectedLocalKeys,
      }),
    );
    expect(
      ctx.ports.vaultLocalRepository.saveRecoveredDeviceAccess,
    ).toHaveBeenCalledOnce();
    expect(
      ctx.ports.vaultLocalRepository.saveDeviceAccessMaterial,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveDeviceAccessRecoveryBackup,
    ).not.toHaveBeenCalled();
  });

  it("cannot recover a device removed from the current snapshot", async () => {
    const ctx = createContext();
    ctx.saved.vaultSnapshot = {
      ...ctx.vaultSnapshot,
      keySlots: { deviceSlots: [] },
    };

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
        newMasterPassword: ctx.values.newMasterPassword,
      }),
    ).rejects.toBeInstanceOf(DeviceKeySlotNotFoundError);
  });

  it("rejects a recovered wrapping private key that does not match local identity", async () => {
    const ctx = createContext();
    vi.mocked(ctx.ports.crypto.verifyDeviceVaultKeyPair).mockResolvedValue(
      false,
    );

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
        newMasterPassword: ctx.values.newMasterPassword,
      }),
    ).rejects.toBeInstanceOf(DeviceKeySlotVerificationFailedError);

    expect(ctx.ports.crypto.openDeviceVaultKeyEnvelope).not.toHaveBeenCalled();
  });
});
