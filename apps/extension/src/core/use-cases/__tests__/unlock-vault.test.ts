import { describe, expect, it, vi } from "vitest";
import {
  DeviceAccessMaterialNotFoundError,
  DeviceKeySlotNotFoundError,
  VaultSnapshotNotFoundError,
  VaultSnapshotSignatureVerificationFailedError,
} from "../errors/unlock-vault.errors";
import { createUnlockVaultTestContext } from "../../__tests__/fixtures/unlock-vault";

describe("UnlockVaultUseCase", () => {
  it("unlocks a vault and stores runtime vault state", async () => {
    const ctx = createUnlockVaultTestContext();

    const result = await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      masterPassword: ctx.values.masterPassword,
    });

    expect(result).toEqual({
      vault: ctx.values.decryptedVault,
    });

    expect(
      ctx.ports.vaultLocalRepository.getDeviceAccessMaterial,
    ).toHaveBeenCalledWith(ctx.values.vaultId);
    expect(
      ctx.ports.vaultLocalRepository.getVaultSnapshot,
    ).toHaveBeenCalledWith(ctx.values.vaultId);
    expect(ctx.ports.crypto.verifyVaultSnapshotSignature).toHaveBeenCalledWith(
      ctx.vaultSnapshot,
      ctx.values.devicePublicSignKey,
    );
    expect(ctx.ports.crypto.deriveLocalRootKey).toHaveBeenCalledWith(
      ctx.values.masterPassword,
      ctx.values.masterPasswordSalt,
    );
    expect(ctx.ports.crypto.deriveLocalKeysProtectionKey).toHaveBeenCalledWith(
      ctx.values.localRootKey,
      ctx.values.localKeysProtectionSalt,
    );
    expect(ctx.ports.crypto.unwrapLocalKeysPayload).toHaveBeenCalledWith(
      ctx.values.protectedLocalKeys,
      ctx.values.localKeysProtectionKey,
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

    expect(ctx.saved.unlockedVault).toEqual({
      vaultId: ctx.values.vaultId,
      deviceId: ctx.values.deviceId,
      vault: ctx.values.decryptedVault,
      vaultMasterKey: ctx.values.vaultMasterKey,
      devicePrivateSignKey: ctx.values.devicePrivateSignKey,
    });
  });

  it("fails when device access material is missing", async () => {
    const ctx = createUnlockVaultTestContext();
    ctx.saved.deviceAccessMaterial = undefined;

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        masterPassword: ctx.values.masterPassword,
      }),
    ).rejects.toBeInstanceOf(DeviceAccessMaterialNotFoundError);

    expect(
      ctx.ports.vaultLocalRepository.getVaultSnapshot,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.unlockedVaultRepository.saveUnlockedVault,
    ).not.toHaveBeenCalled();
  });

  it("fails when vault snapshot is missing", async () => {
    const ctx = createUnlockVaultTestContext();
    ctx.saved.vaultSnapshot = undefined;

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        masterPassword: ctx.values.masterPassword,
      }),
    ).rejects.toBeInstanceOf(VaultSnapshotNotFoundError);

    expect(
      ctx.ports.crypto.verifyVaultSnapshotSignature,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.unlockedVaultRepository.saveUnlockedVault,
    ).not.toHaveBeenCalled();
  });

  it("fails when snapshot signature verification fails", async () => {
    const ctx = createUnlockVaultTestContext();

    vi.mocked(
      ctx.ports.crypto.verifyVaultSnapshotSignature,
    ).mockResolvedValueOnce(false);

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        masterPassword: ctx.values.masterPassword,
      }),
    ).rejects.toBeInstanceOf(VaultSnapshotSignatureVerificationFailedError);

    expect(ctx.ports.crypto.deriveLocalRootKey).not.toHaveBeenCalled();
    expect(
      ctx.ports.unlockedVaultRepository.saveUnlockedVault,
    ).not.toHaveBeenCalled();
  });

  it("fails when current device key slot is missing", async () => {
    const ctx = createUnlockVaultTestContext();
    ctx.saved.vaultSnapshot = {
      ...ctx.vaultSnapshot,
      keySlots: {
        ...ctx.vaultSnapshot.keySlots,
        deviceSlots: [],
      },
    };

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        masterPassword: ctx.values.masterPassword,
      }),
    ).rejects.toBeInstanceOf(DeviceKeySlotNotFoundError);

    expect(ctx.ports.crypto.unwrapVaultMasterKey).not.toHaveBeenCalled();
    expect(
      ctx.ports.unlockedVaultRepository.saveUnlockedVault,
    ).not.toHaveBeenCalled();
  });
});
