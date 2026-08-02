import { describe, expect, it, vi } from "vitest";
import { createChangeMasterPasswordTestContext } from "../../__tests__/fixtures/change-master-password";
import type { RawMasterPassword } from "../../domain/master-password";
import { UnsupportedAlgorithmSuiteError } from "../../errors/algorithm-suite.errors";
import {
  DeviceAccessMaterialNotFoundForMasterPasswordChangeError,
  VaultMustBeUnlockedForMasterPasswordChangeError,
} from "../../errors/change-master-password.errors";
import { InvalidNewMasterPasswordError } from "../../errors/master-password.errors";

describe("ChangeMasterPasswordUseCase", () => {
  it("rejects a weak new password before reading the session", async () => {
    const ctx = createChangeMasterPasswordTestContext();

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        currentMasterPassword: "12345678901" as RawMasterPassword,
        newMasterPassword: "Password1234567!" as RawMasterPassword,
      }),
    ).rejects.toBeInstanceOf(InvalidNewMasterPasswordError);

    expect(
      ctx.ports.sessionServices.unlockedVaultSession.get,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.crypto.deriveLocalRootKey).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveDeviceAccessMaterial,
    ).not.toHaveBeenCalled();
  });

  it("accepts a strong new password while verifying a short current password", async () => {
    const ctx = createChangeMasterPasswordTestContext();
    const currentMasterPassword = "12345678901" as RawMasterPassword;
    const newMasterPassword = "vN7#qL2!xP9@rT4$" as RawMasterPassword;

    await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      currentMasterPassword,
      newMasterPassword,
    });

    expect(ctx.ports.crypto.deriveLocalRootKey).toHaveBeenNthCalledWith(
      1,
      currentMasterPassword,
      ctx.values.masterPasswordSalt,
    );
    expect(ctx.ports.crypto.deriveLocalRootKey).toHaveBeenNthCalledWith(
      2,
      newMasterPassword,
      ctx.values.newMasterPasswordSalt,
    );
  });

  it("re-protects local device access material with the new master password", async () => {
    const ctx = createChangeMasterPasswordTestContext();

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        currentMasterPassword: ctx.values.masterPassword,
        newMasterPassword: ctx.values.newMasterPassword,
      }),
    ).resolves.toBeUndefined();

    expect(
      ctx.ports.sessionServices.unlockedVaultSession.get,
    ).toHaveBeenCalledTimes(1);
    expect(
      ctx.ports.vaultLocalRepository.getDeviceAccessMaterial,
    ).toHaveBeenCalledWith(ctx.values.vaultId);
    expect(ctx.ports.crypto.deriveLocalRootKey).toHaveBeenNthCalledWith(
      1,
      ctx.values.masterPassword,
      ctx.values.masterPasswordSalt,
    );
    expect(
      ctx.ports.crypto.deriveLocalKeysProtectionKey,
    ).toHaveBeenNthCalledWith(
      1,
      ctx.values.localRootKey,
      ctx.values.localKeysProtectionSalt,
    );
    expect(ctx.ports.crypto.unwrapLocalKeysPayload).toHaveBeenCalledWith(
      ctx.values.protectedLocalKeys,
      ctx.values.localKeysProtectionKey,
    );
    expect(ctx.ports.crypto.generateMasterPasswordSalt).toHaveBeenCalledTimes(
      1,
    );
    expect(ctx.ports.crypto.deriveLocalRootKey).toHaveBeenNthCalledWith(
      2,
      ctx.values.newMasterPassword,
      ctx.values.newMasterPasswordSalt,
    );
    expect(
      ctx.ports.crypto.generateLocalKeysProtectionSalt,
    ).toHaveBeenCalledTimes(1);
    expect(
      ctx.ports.crypto.deriveLocalKeysProtectionKey,
    ).toHaveBeenNthCalledWith(
      2,
      ctx.values.newLocalRootKey,
      ctx.values.newLocalKeysProtectionSalt,
    );
    expect(ctx.ports.crypto.wrapLocalKeysPayload).toHaveBeenCalledWith(
      {
        devicePrivateSignKey: ctx.values.devicePrivateSignKey,
        devicePrivateVaultKey: ctx.values.devicePrivateVaultKey,
        deviceLocalProtectionKey: ctx.values.deviceLocalProtectionKey,
        vaultTrustAnchor: ctx.values.vaultTrustAnchor,
      },
      ctx.values.newLocalKeysProtectionKey,
    );

    expect(ctx.saved.deviceAccessMaterial).toEqual({
      ...ctx.deviceAccessMaterial,
      masterPasswordSalt: ctx.values.newMasterPasswordSalt,
      localKeysProtectionSalt: ctx.values.newLocalKeysProtectionSalt,
      protectedLocalKeys: ctx.values.reprotectedLocalKeys,
    });
  });

  it("fails when the target vault is not unlocked", async () => {
    const ctx = createChangeMasterPasswordTestContext();
    ctx.saved.unlockedVaultSession = undefined;

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        currentMasterPassword: ctx.values.masterPassword,
        newMasterPassword: ctx.values.newMasterPassword,
      }),
    ).rejects.toBeInstanceOf(VaultMustBeUnlockedForMasterPasswordChangeError);

    expect(
      ctx.ports.vaultLocalRepository.getDeviceAccessMaterial,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveDeviceAccessMaterial,
    ).not.toHaveBeenCalled();
  });

  it("fails when another vault is unlocked", async () => {
    const ctx = createChangeMasterPasswordTestContext();
    ctx.saved.unlockedVaultSession = {
      ...ctx.saved.unlockedVaultSession!,
      unlockedVault: {
        ...ctx.saved.unlockedVaultSession!.unlockedVault,
        vaultId: "another-vault-id",
      },
    };

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        currentMasterPassword: ctx.values.masterPassword,
        newMasterPassword: ctx.values.newMasterPassword,
      }),
    ).rejects.toBeInstanceOf(VaultMustBeUnlockedForMasterPasswordChangeError);

    expect(
      ctx.ports.vaultLocalRepository.getDeviceAccessMaterial,
    ).not.toHaveBeenCalled();
  });

  it("fails when device access material is missing", async () => {
    const ctx = createChangeMasterPasswordTestContext();
    ctx.saved.deviceAccessMaterial = undefined;

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        currentMasterPassword: ctx.values.masterPassword,
        newMasterPassword: ctx.values.newMasterPassword,
      }),
    ).rejects.toBeInstanceOf(
      DeviceAccessMaterialNotFoundForMasterPasswordChangeError,
    );

    expect(ctx.ports.crypto.deriveLocalRootKey).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveDeviceAccessMaterial,
    ).not.toHaveBeenCalled();
  });

  it("fails when device access material uses unsupported algorithm suite", async () => {
    const ctx = createChangeMasterPasswordTestContext();
    ctx.saved.deviceAccessMaterial = {
      ...ctx.deviceAccessMaterial,
      algorithmSuiteId: "spm-unsupported",
    };

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        currentMasterPassword: ctx.values.masterPassword,
        newMasterPassword: ctx.values.newMasterPassword,
      }),
    ).rejects.toBeInstanceOf(UnsupportedAlgorithmSuiteError);

    expect(ctx.ports.crypto.deriveLocalRootKey).not.toHaveBeenCalled();
    expect(ctx.ports.crypto.unwrapLocalKeysPayload).not.toHaveBeenCalled();
    expect(ctx.ports.crypto.wrapLocalKeysPayload).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveDeviceAccessMaterial,
    ).not.toHaveBeenCalled();
  });

  it("does not save updated access material when current password unwrap fails", async () => {
    const ctx = createChangeMasterPasswordTestContext();
    const error = new Error("unwrap failed");

    vi.mocked(ctx.ports.crypto.unwrapLocalKeysPayload).mockRejectedValueOnce(
      error,
    );

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        currentMasterPassword: ctx.values.masterPassword,
        newMasterPassword: ctx.values.newMasterPassword,
      }),
    ).rejects.toThrow(error);

    expect(ctx.ports.crypto.generateMasterPasswordSalt).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveDeviceAccessMaterial,
    ).not.toHaveBeenCalled();
  });
});
