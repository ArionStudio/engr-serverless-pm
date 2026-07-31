import { describe, expect, it, vi } from "vitest";
import { createUnlockVaultTestContext } from "../../__tests__/fixtures/unlock-vault";
import { UnsupportedAlgorithmSuiteError } from "../../errors/algorithm-suite.errors";
import {
  DeviceKeySlotNotFoundError,
  DeviceKeySlotVerificationFailedError,
} from "../../errors/unlock-vault.errors";

describe("UnlockVaultUseCase", () => {
  it("verifies both local key pairs and opens the current envelope", async () => {
    const ctx = createUnlockVaultTestContext();

    await ctx.useCase.execute({
      vaultId: ctx.values.vaultId,
      masterPassword: ctx.values.masterPassword,
      lockAfterMs: 60_000,
    });

    expect(ctx.ports.crypto.verifyDeviceSignKeyPair).toHaveBeenCalledWith(
      ctx.values.devicePublicSignKey,
      ctx.values.devicePrivateSignKey,
    );
    expect(ctx.ports.crypto.verifyDeviceVaultKeyPair).toHaveBeenCalledWith(
      ctx.values.devicePublicVaultKey,
      ctx.values.devicePrivateVaultKey,
    );
    expect(ctx.ports.crypto.openDeviceVaultKeyEnvelope).toHaveBeenCalledWith(
      ctx.values.vaultKeyEnvelope,
      ctx.values.devicePrivateVaultKey,
      {
        vaultId: ctx.values.vaultId,
        deviceId: ctx.values.deviceId,
        vaultKeyGeneration: 1,
        algorithmSuiteId: "spm-v1",
      },
    );
    expect(ctx.saved.unlockedVaultSession?.unlockedVault).toMatchObject({
      devicePrivateVaultKey: ctx.values.devicePrivateVaultKey,
      deviceLocalProtectionKey: ctx.values.deviceLocalProtectionKey,
    });
  });

  it("rejects a missing local envelope before vault decryption", async () => {
    const ctx = createUnlockVaultTestContext();
    ctx.saved.vaultSnapshot = {
      ...ctx.vaultSnapshot,
      keySlots: { deviceSlots: [] },
    };

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        masterPassword: ctx.values.masterPassword,
        lockAfterMs: 60_000,
      }),
    ).rejects.toBeInstanceOf(DeviceKeySlotNotFoundError);

    expect(ctx.ports.crypto.decryptVaultSnapshotContent).not.toHaveBeenCalled();
  });

  it.each(["signing", "wrapping"] as const)(
    "rejects a mismatched %s key pair before opening the envelope",
    async (keyKind) => {
      const ctx = createUnlockVaultTestContext();

      if (keyKind === "signing") {
        vi.mocked(ctx.ports.crypto.verifyDeviceSignKeyPair).mockResolvedValue(
          false,
        );
      } else {
        vi.mocked(ctx.ports.crypto.verifyDeviceVaultKeyPair).mockResolvedValue(
          false,
        );
      }

      await expect(
        ctx.useCase.execute({
          vaultId: ctx.values.vaultId,
          masterPassword: ctx.values.masterPassword,
          lockAfterMs: 60_000,
        }),
      ).rejects.toBeInstanceOf(DeviceKeySlotVerificationFailedError);

      expect(
        ctx.ports.crypto.openDeviceVaultKeyEnvelope,
      ).not.toHaveBeenCalled();
    },
  );

  it("rejects an unsupported snapshot suite", async () => {
    const ctx = createUnlockVaultTestContext();
    ctx.saved.vaultSnapshot = {
      ...ctx.vaultSnapshot,
      metadata: {
        ...ctx.vaultSnapshot.metadata,
        algorithmSuiteId: "unknown",
      },
    };

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        masterPassword: ctx.values.masterPassword,
        lockAfterMs: 60_000,
      }),
    ).rejects.toBeInstanceOf(UnsupportedAlgorithmSuiteError);
  });

  it("removes lock metadata when task scheduling fails", async () => {
    const ctx = createUnlockVaultTestContext();
    vi.mocked(ctx.ports.scheduledTasks.scheduleTask).mockRejectedValue(
      new Error("schedule failed"),
    );

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        masterPassword: ctx.values.masterPassword,
        lockAfterMs: 60_000,
      }),
    ).rejects.toThrow("schedule failed");

    expect(ctx.ports.vaultLockTasks.remove).toHaveBeenCalled();
    expect(ctx.saved.unlockedVaultSession).toBeUndefined();
  });

  it("cancels the scheduled lock and removes metadata when activation fails", async () => {
    const ctx = createUnlockVaultTestContext();
    const activationError = new Error("session activation failed");
    vi.mocked(
      ctx.ports.unlockedVaultSessionMaterialRepository
        .saveUnlockedVaultSessionMaterial,
    ).mockRejectedValueOnce(activationError);

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
        masterPassword: ctx.values.masterPassword,
        lockAfterMs: 60_000,
      }),
    ).rejects.toBe(activationError);

    expect(ctx.ports.scheduledTasks.cancelTask).toHaveBeenCalledWith({
      name: "lockVault",
      actionId: ctx.values.vaultLockActionId,
    });
    expect(ctx.ports.vaultLockTasks.remove).toHaveBeenCalled();
    expect(ctx.saved.unlockedVaultSession).toBeUndefined();
  });
});
