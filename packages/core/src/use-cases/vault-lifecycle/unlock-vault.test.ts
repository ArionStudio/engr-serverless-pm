import { describe, expect, it, vi } from "vitest";
import { UnsupportedAlgorithmSuiteError } from "../__errors/algorithm-suite.errors";
import {
  DeviceAccessMaterialNotFoundError,
  DeviceKeySlotNotFoundError,
  VaultSnapshotNotFoundError,
  VaultSnapshotSignatureVerificationFailedError,
  VaultSnapshotSignerNotTrustedError,
} from "../__errors/unlock-vault.errors";
import { InvalidVaultLockDelayError } from "../__errors/vault-session.errors";
import { createUnlockVaultTestContext } from "../../__tests__/fixtures/unlock-vault";

describe("UnlockVaultUseCase", () => {
  it("unlocks a vault and stores runtime vault state", async () => {
    const ctx = createUnlockVaultTestContext();

    const result = await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      masterPassword: ctx.values.masterPassword,
      lockAfterMs: 600_000,
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

    expect(ctx.saved.unlockedVaultSession).toEqual({
      unlockedVault: {
        vaultId: ctx.values.vaultId,
        deviceId: ctx.values.deviceId,
        vault: ctx.values.decryptedVault,
        vaultMasterKey: ctx.values.vaultMasterKey,
        devicePrivateSignKey: ctx.values.devicePrivateSignKey,
      },
      sourceSnapshotRevision: 1,
    });
    expect(ctx.ports.vaultLockTasks.save).toHaveBeenCalledWith({
      actionId: ctx.values.vaultLockActionId,
      vaultId: ctx.values.vaultId,
      expiresAt: ctx.values.timestamp + 600_000,
    });
    expect(ctx.ports.scheduledTasks.scheduleTask).toHaveBeenCalledWith({
      task: {
        name: "lockVault",
        actionId: ctx.values.vaultLockActionId,
      },
      runAt: ctx.values.timestamp + 600_000,
    });
  });

  it("fails when device access material is missing", async () => {
    const ctx = createUnlockVaultTestContext();
    ctx.saved.deviceAccessMaterial = undefined;

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        masterPassword: ctx.values.masterPassword,
        lockAfterMs: 600_000,
      }),
    ).rejects.toBeInstanceOf(DeviceAccessMaterialNotFoundError);

    expect(
      ctx.ports.vaultLocalRepository.getVaultSnapshot,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.unlockedVaultRepository.saveUnlockedVaultSession,
    ).not.toHaveBeenCalled();
  });

  it("fails when vault snapshot is missing", async () => {
    const ctx = createUnlockVaultTestContext();
    ctx.saved.vaultSnapshot = undefined;

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        masterPassword: ctx.values.masterPassword,
        lockAfterMs: 600_000,
      }),
    ).rejects.toBeInstanceOf(VaultSnapshotNotFoundError);

    expect(
      ctx.ports.crypto.verifyVaultSnapshotSignature,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.unlockedVaultRepository.saveUnlockedVaultSession,
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
        lockAfterMs: 600_000,
      }),
    ).rejects.toBeInstanceOf(VaultSnapshotSignatureVerificationFailedError);

    expect(ctx.ports.crypto.deriveLocalRootKey).not.toHaveBeenCalled();
    expect(
      ctx.ports.unlockedVaultRepository.saveUnlockedVaultSession,
    ).not.toHaveBeenCalled();
  });

  it("fails when device access material uses unsupported algorithm suite", async () => {
    const ctx = createUnlockVaultTestContext();
    ctx.saved.deviceAccessMaterial = {
      ...ctx.deviceAccessMaterial,
      algorithmSuiteId: "spm-unsupported",
    };

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        masterPassword: ctx.values.masterPassword,
        lockAfterMs: 600_000,
      }),
    ).rejects.toBeInstanceOf(UnsupportedAlgorithmSuiteError);

    expect(
      ctx.ports.crypto.verifyVaultSnapshotSignature,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.crypto.deriveLocalRootKey).not.toHaveBeenCalled();
    expect(
      ctx.ports.unlockedVaultRepository.saveUnlockedVaultSession,
    ).not.toHaveBeenCalled();
  });

  it("fails when vault snapshot uses unsupported algorithm suite", async () => {
    const ctx = createUnlockVaultTestContext();
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
        masterPassword: ctx.values.masterPassword,
        lockAfterMs: 600_000,
      }),
    ).rejects.toBeInstanceOf(UnsupportedAlgorithmSuiteError);

    expect(
      ctx.ports.crypto.verifyVaultSnapshotSignature,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.crypto.deriveLocalRootKey).not.toHaveBeenCalled();
    expect(
      ctx.ports.unlockedVaultRepository.saveUnlockedVaultSession,
    ).not.toHaveBeenCalled();
  });

  it("fails when snapshot signer is not trusted", async () => {
    const ctx = createUnlockVaultTestContext();
    ctx.saved.vaultSnapshot = {
      ...ctx.vaultSnapshot,
      trustedDevices: [],
    };

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        masterPassword: ctx.values.masterPassword,
        lockAfterMs: 600_000,
      }),
    ).rejects.toBeInstanceOf(VaultSnapshotSignerNotTrustedError);

    expect(
      ctx.ports.crypto.verifyVaultSnapshotSignature,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.crypto.deriveLocalRootKey).not.toHaveBeenCalled();
    expect(
      ctx.ports.unlockedVaultRepository.saveUnlockedVaultSession,
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
        lockAfterMs: 600_000,
      }),
    ).rejects.toBeInstanceOf(DeviceKeySlotNotFoundError);

    expect(ctx.ports.crypto.unwrapVaultMasterKey).not.toHaveBeenCalled();
    expect(
      ctx.ports.unlockedVaultRepository.saveUnlockedVaultSession,
    ).not.toHaveBeenCalled();
  });

  it("does not store runtime vault state when lock task cannot be scheduled", async () => {
    const ctx = createUnlockVaultTestContext();
    const error = new Error("schedule failed");

    vi.mocked(ctx.ports.scheduledTasks.scheduleTask).mockRejectedValueOnce(
      error,
    );

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        masterPassword: ctx.values.masterPassword,
        lockAfterMs: 600_000,
      }),
    ).rejects.toThrow(error);

    expect(
      ctx.ports.unlockedVaultRepository.saveUnlockedVaultSession,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.vaultLockTasks.remove).toHaveBeenCalledTimes(1);
  });

  it("preserves schedule failure when lock task metadata cleanup fails", async () => {
    const ctx = createUnlockVaultTestContext();
    const scheduleError = new Error("schedule failed");
    const removeError = new Error("remove failed");

    vi.mocked(ctx.ports.scheduledTasks.scheduleTask).mockRejectedValueOnce(
      scheduleError,
    );
    vi.mocked(ctx.ports.vaultLockTasks.remove).mockRejectedValueOnce(
      removeError,
    );

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        masterPassword: ctx.values.masterPassword,
        lockAfterMs: 600_000,
      }),
    ).rejects.toThrow(scheduleError);

    expect(
      ctx.ports.unlockedVaultRepository.saveUnlockedVaultSession,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.vaultLockTasks.remove).toHaveBeenCalledTimes(1);
  });

  it("cancels scheduled lock task when runtime vault state cannot be stored", async () => {
    const ctx = createUnlockVaultTestContext();
    const error = new Error("save failed");

    vi.mocked(
      ctx.ports.unlockedVaultRepository.saveUnlockedVaultSession,
    ).mockRejectedValueOnce(error);

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        masterPassword: ctx.values.masterPassword,
        lockAfterMs: 600_000,
      }),
    ).rejects.toThrow(error);

    expect(ctx.ports.scheduledTasks.cancelTask).toHaveBeenCalledWith({
      name: "lockVault",
      actionId: ctx.values.vaultLockActionId,
    });
    expect(ctx.ports.vaultLockTasks.remove).toHaveBeenCalledTimes(1);
  });

  it("removes lock task metadata when canceling scheduled lock task fails", async () => {
    const ctx = createUnlockVaultTestContext();
    const saveError = new Error("save failed");
    const cancelError = new Error("cancel failed");

    vi.mocked(
      ctx.ports.unlockedVaultRepository.saveUnlockedVaultSession,
    ).mockRejectedValueOnce(saveError);
    vi.mocked(ctx.ports.scheduledTasks.cancelTask).mockRejectedValueOnce(
      cancelError,
    );

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        masterPassword: ctx.values.masterPassword,
        lockAfterMs: 600_000,
      }),
    ).rejects.toThrow(saveError);

    expect(ctx.ports.scheduledTasks.cancelTask).toHaveBeenCalledWith({
      name: "lockVault",
      actionId: ctx.values.vaultLockActionId,
    });
    expect(ctx.ports.vaultLockTasks.remove).toHaveBeenCalledTimes(1);
  });

  it("fails before reading vault data when lock delay is invalid", async () => {
    const ctx = createUnlockVaultTestContext();

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        masterPassword: ctx.values.masterPassword,
        lockAfterMs: 45_000 as never,
      }),
    ).rejects.toBeInstanceOf(InvalidVaultLockDelayError);

    expect(
      ctx.ports.vaultLocalRepository.getDeviceAccessMaterial,
    ).not.toHaveBeenCalled();
    expect(ctx.ports.scheduledTasks.scheduleTask).not.toHaveBeenCalled();
  });
});
