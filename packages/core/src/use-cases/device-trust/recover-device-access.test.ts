import { describe, expect, it, vi } from "vitest";
import { createUnlockVaultTestContext } from "../../__tests__/fixtures/unlock-vault";
import type { DeviceAccessRecoveryBackup } from "../../domain/device-trust";
import type { RawMasterPassword } from "../../domain/master-password";
import { InvalidNewMasterPasswordError } from "../../errors/master-password.errors";
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
  const useCase = new RecoverDeviceAccessUseCase(
    ctx.ports.bip39,
    ctx.ports.crypto,
    ctx.ports.sessionServices.unlockedVaultSession,
    ctx.ports.vaultLocalRepository,
  );

  return { ...ctx, backup, useCase };
}

describe("RecoverDeviceAccessUseCase", () => {
  it("rejects a short new password before reading recovery state", async () => {
    const ctx = createContext();
    const requireVaultCanBeActivated = vi.spyOn(
      ctx.ports.sessionServices.unlockedVaultSession,
      "requireVaultCanBeActivated",
    );

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
        newMasterPassword: "12345678901" as RawMasterPassword,
      }),
    ).rejects.toBeInstanceOf(InvalidNewMasterPasswordError);

    expect(requireVaultCanBeActivated).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.getDeviceAccessRecoveryBackup,
    ).not.toHaveBeenCalled();
  });

  it("accepts a new password at the minimum length", async () => {
    const ctx = createContext();
    const newMasterPassword = "123456789012" as RawMasterPassword;

    await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
      newMasterPassword,
    });

    expect(ctx.ports.crypto.deriveLocalRootKey).toHaveBeenCalledWith(
      newMasterPassword,
      ctx.values.masterPasswordSalt,
    );
  });

  it("recovers the wrapping key and re-protects the complete local identity", async () => {
    const ctx = createContext();

    await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
      newMasterPassword: ctx.values.newMasterPassword,
    });

    expect(ctx.ports.crypto.verifyDeviceVaultKeyPair).toHaveBeenCalledWith(
      ctx.values.devicePublicVaultKey,
      ctx.values.devicePrivateVaultKey,
    );
    expect(ctx.ports.crypto.openDeviceVaultKeyEnvelope).toHaveBeenCalled();
    expect(ctx.saved.deviceAccessMaterial).toMatchObject({
      devicePublicSignKey: ctx.values.devicePublicSignKey,
      devicePublicVaultKey: ctx.values.devicePublicVaultKey,
    });
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
