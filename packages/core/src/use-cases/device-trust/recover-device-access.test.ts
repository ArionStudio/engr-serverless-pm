import { describe, expect, it, vi } from "vitest";
import { createUnlockVaultTestContext } from "../../__tests__/fixtures/unlock-vault";
import type { DeviceAccessRecoveryBackup } from "../../domain/device-trust";
import {
  DeviceKeySlotNotFoundError,
  DeviceKeySlotVerificationFailedError,
} from "../../errors/unlock-vault.errors";
import { DeviceAccessMaterialChangedError } from "../../errors/vault-device.errors";
import { ChangeMasterPasswordUseCase } from "../vault-lifecycle/change-master-password";
import { RecoverDeviceAccessUseCase } from "./recover-device-access";

function createContext() {
  const ctx = createUnlockVaultTestContext();
  const backup: DeviceAccessRecoveryBackup = {
    revision: 1,
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

function deferRecoveryReplacement(ctx: ReturnType<typeof createContext>) {
  vi.mocked(ctx.ports.crypto.generateRecoveryKey).mockResolvedValue(
    ctx.values.rotatedRecoverySecretKey,
  );
  vi.mocked(
    ctx.ports.crypto.generateRecoveryLocalKeysProtectionSalt,
  ).mockResolvedValue(ctx.values.rotatedRecoveryLocalKeysProtectionSalt);

  const wrapLocalKeysPayload = vi.mocked(ctx.ports.crypto.wrapLocalKeysPayload);
  const defaultWrapLocalKeysPayload =
    wrapLocalKeysPayload.getMockImplementation();

  if (defaultWrapLocalKeysPayload === undefined) {
    throw new Error("Expected a local-key wrapping implementation.");
  }

  let continueRecoveryWrapping!: () => void;
  let markRecoveryWrappingStarted!: () => void;
  const recoveryWrappingStarted = new Promise<void>((resolve) => {
    markRecoveryWrappingStarted = resolve;
  });
  const recoveryWrappingCanContinue = new Promise<void>((resolve) => {
    continueRecoveryWrapping = resolve;
  });
  wrapLocalKeysPayload.mockImplementation(async (payload, protectionKey) => {
    if (protectionKey === ctx.values.rotatedRecoveryLocalKeysProtectionKey) {
      markRecoveryWrappingStarted();
      await recoveryWrappingCanContinue;
    }

    return defaultWrapLocalKeysPayload(payload, protectionKey);
  });

  return {
    continueRecoveryWrapping,
    recoveryWrappingStarted,
  };
}

function expectSecretSafeMaterialChange(
  error: unknown,
  ctx: ReturnType<typeof createContext>,
): void {
  expect(error).toBeInstanceOf(DeviceAccessMaterialChangedError);

  if (!(error instanceof Error)) {
    throw new Error("Expected a device access material conflict.");
  }

  expect(error.name).toBe("DeviceAccessMaterialChangedError");
  expect(error.message).toBe(
    `Device access material for vault "${ctx.values.vaultId}" changed before save.`,
  );
  expect(error.cause).toBeUndefined();
  expect(String(error)).not.toContain(ctx.values.masterPassword);
  expect(String(error)).not.toContain(ctx.values.newMasterPassword);
  expect(Object.values(error)).not.toContain(ctx.values.devicePublicSignKey);
  expect(Object.values(error)).not.toContain(ctx.values.devicePrivateSignKey);
  expect(Object.values(error)).not.toContain(ctx.values.devicePublicVaultKey);
  expect(Object.values(error)).not.toContain(ctx.values.devicePrivateVaultKey);
}

describe("RecoverDeviceAccessUseCase", () => {
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
      revision: ctx.deviceAccessMaterial.revision + 1,
      devicePublicSignKey: ctx.values.devicePublicSignKey,
      devicePublicVaultKey: ctx.values.devicePublicVaultKey,
    });
    expect(ctx.saved.deviceAccessRecoveryBackup?.revision).toBe(
      ctx.backup.revision + 1,
    );
  });

  it("recovers when device access material is absent", async () => {
    const ctx = createContext();
    ctx.saved.deviceAccessMaterial = undefined;

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
        newMasterPassword: ctx.values.newMasterPassword,
      }),
    ).resolves.toMatchObject({ deviceId: ctx.values.deviceId });

    expect(ctx.saved.deviceAccessMaterial).toBeDefined();
    expect(
      ctx.ports.vaultLocalRepository.saveRecoveredDeviceAccess,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedDeviceAccessMaterialRevision: null,
      }),
    );
  });

  it("does not overwrite a concurrent password change or partially rotate recovery", async () => {
    const ctx = createContext();
    ctx.saved.unlockedVaultSession = {
      sessionId: ctx.values.sessionId,
      unlockedVault: {
        vaultId: ctx.values.vaultId,
        deviceId: ctx.values.deviceId,
        vault: ctx.values.decryptedVault,
        vaultMasterKey: ctx.values.vaultMasterKey,
        devicePrivateSignKey: ctx.values.devicePrivateSignKey,
        devicePrivateVaultKey: ctx.values.devicePrivateVaultKey,
        deviceLocalProtectionKey: ctx.values.deviceLocalProtectionKey,
        trustedSnapshotContext: {
          snapshotDigest: ctx.values.vaultSnapshotDigest,
          trust: ctx.values.verifiedVaultTrustState,
        },
        vaultTrustAnchor: ctx.values.vaultTrustAnchor,
      },
      sourceSnapshotVersionVector: { [ctx.values.deviceId]: 1 },
    };
    vi.mocked(ctx.ports.crypto.generateMasterPasswordSalt).mockResolvedValue(
      ctx.values.newMasterPasswordSalt,
    );
    vi.mocked(
      ctx.ports.crypto.generateLocalKeysProtectionSalt,
    ).mockResolvedValue(ctx.values.newLocalKeysProtectionSalt);
    const { continueRecoveryWrapping, recoveryWrappingStarted } =
      deferRecoveryReplacement(ctx);

    const recovery = ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
      newMasterPassword: ctx.values.newMasterPassword,
    });

    await recoveryWrappingStarted;

    const changeMasterPassword = new ChangeMasterPasswordUseCase(
      ctx.ports.crypto,
      ctx.ports.vaultLocalRepository,
      ctx.ports.sessionServices.unlockedVaultSession,
    );
    await changeMasterPassword.execute({
      vaultId: ctx.values.vaultId,
      currentMasterPassword: ctx.values.masterPassword,
      newMasterPassword: ctx.values.newMasterPassword,
    });

    const passwordChangedMaterial = {
      ...ctx.deviceAccessMaterial,
      revision: ctx.deviceAccessMaterial.revision + 1,
      masterPasswordSalt: ctx.values.newMasterPasswordSalt,
      localKeysProtectionSalt: ctx.values.newLocalKeysProtectionSalt,
      protectedLocalKeys: ctx.values.reprotectedLocalKeys,
    };
    expect(ctx.saved.deviceAccessMaterial).toEqual(passwordChangedMaterial);

    const materialChange = recovery.catch((caught: unknown) => caught);
    continueRecoveryWrapping();
    expectSecretSafeMaterialChange(await materialChange, ctx);

    expect(ctx.saved.deviceAccessMaterial).toEqual(passwordChangedMaterial);
    expect(ctx.saved.deviceAccessRecoveryBackup).toEqual(ctx.backup);
  });

  it("does not overwrite a concurrently replaced recovery backup", async () => {
    const ctx = createContext();
    const originalDeviceAccessMaterial = ctx.saved.deviceAccessMaterial;
    const { continueRecoveryWrapping, recoveryWrappingStarted } =
      deferRecoveryReplacement(ctx);
    const recovery = ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      recoveryMnemonicKey: ctx.values.recoveryMnemonicKey,
      newMasterPassword: ctx.values.newMasterPassword,
    });

    await recoveryWrappingStarted;

    const concurrentlyReplacedBackup: DeviceAccessRecoveryBackup = {
      ...ctx.backup,
      revision: ctx.backup.revision + 1,
      recoveryLocalKeysProtectionSalt:
        ctx.values.rotatedRecoveryLocalKeysProtectionSalt,
      protectedLocalKeys: ctx.values.rotatedRecoveryProtectedLocalKeys,
    };
    ctx.saved.deviceAccessRecoveryBackup = concurrentlyReplacedBackup;

    const materialChange = recovery.catch((caught: unknown) => caught);
    continueRecoveryWrapping();
    expectSecretSafeMaterialChange(await materialChange, ctx);

    expect(ctx.saved.deviceAccessMaterial).toEqual(
      originalDeviceAccessMaterial,
    );
    expect(ctx.saved.deviceAccessRecoveryBackup).toEqual(
      concurrentlyReplacedBackup,
    );
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
