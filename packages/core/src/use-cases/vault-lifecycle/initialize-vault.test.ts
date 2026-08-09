import { describe, expect, it, vi } from "vitest";
import { createInitializeVaultTestContext } from "../../__tests__/fixtures/initialize-vault";
import type { RawMasterPassword } from "../../domain/master-password";
import { InvalidNewMasterPasswordError } from "../../errors/master-password.errors";
import { DeviceAccessMaterialChangedError } from "../../errors/vault-device.errors";

describe("InitializeVaultUseCase", () => {
  it("rejects a master password below maximum strength before generating IDs", async () => {
    const ctx = createInitializeVaultTestContext();
    const requireVaultCanBeActivated = vi.spyOn(
      ctx.ports.sessionServices.unlockedVaultSession,
      "requireVaultCanBeActivated",
    );

    await expect(
      ctx.useCase.execute({
        masterPassword: "correcthorsebatterystaple" as RawMasterPassword,
        deviceName: "Laptop",
      }),
    ).rejects.toBeInstanceOf(InvalidNewMasterPasswordError);

    expect(requireVaultCanBeActivated).not.toHaveBeenCalled();
    expect(ctx.ports.ids.generateId).not.toHaveBeenCalled();
    expect(ctx.ports.crypto.generateMasterPasswordSalt).not.toHaveBeenCalled();
    expect(ctx.ports.crypto.deriveLocalRootKey).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveInitializedLocalVault,
    ).not.toHaveBeenCalled();
  });

  it("accepts a maximum-strength master password", async () => {
    const ctx = createInitializeVaultTestContext();
    const masterPassword = "vN7#qL2!xP9@rT4$zK6&" as RawMasterPassword;

    await ctx.useCase.execute({ masterPassword, deviceName: "Laptop" });

    expect(ctx.ports.crypto.deriveLocalRootKey).toHaveBeenCalledWith(
      masterPassword,
      ctx.values.masterPasswordSalt,
    );
  });

  it("rejects an invalid freshly generated access generation", async () => {
    const ctx = createInitializeVaultTestContext();
    vi.mocked(ctx.ports.ids.generateId)
      .mockReset()
      .mockResolvedValueOnce(ctx.values.vaultId)
      .mockResolvedValueOnce(ctx.values.deviceId)
      .mockResolvedValueOnce("");

    await expect(
      ctx.useCase.execute({
        masterPassword: ctx.values.masterPassword,
        deviceName: "Laptop",
      }),
    ).rejects.toBeInstanceOf(DeviceAccessMaterialChangedError);

    expect(ctx.ports.crypto.generateMasterPasswordSalt).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveInitializedLocalVault,
    ).not.toHaveBeenCalled();
  });

  it("creates separate signing and wrapping identities with generation one envelope", async () => {
    const ctx = createInitializeVaultTestContext();

    await ctx.useCase.execute({
      masterPassword: ctx.values.masterPassword,
      deviceName: "Laptop",
    });

    const snapshot = ctx.saved.vaultSnapshot;
    expect(snapshot?.metadata).toMatchObject({
      schemaVersion: 1,
      vaultKeyGeneration: 1,
      algorithmSuiteId: "spm-v1",
    });
    expect(snapshot?.keySlots.deviceSlots).toHaveLength(1);
    expect(snapshot?.keySlots.deviceSlots[0]).toMatchObject({
      deviceId: ctx.values.deviceId,
      vaultKeyGeneration: 1,
    });
    expect(ctx.saved.deviceAccessMaterial).toMatchObject({
      localAccessGenerationId: ctx.values.localAccessGenerationId,
      devicePublicSignKey: ctx.values.devicePublicSignKey,
      devicePublicVaultKey: ctx.values.devicePublicVaultKey,
    });
    expect(ctx.saved.deviceAccessRecoveryBackup).toMatchObject({
      localAccessGenerationId: ctx.values.localAccessGenerationId,
    });
    expect(ctx.ports.crypto.wrapLocalKeysPayload).toHaveBeenCalledWith(
      {
        devicePrivateSignKey: ctx.values.devicePrivateSignKey,
        devicePrivateVaultKey: ctx.values.devicePrivateVaultKey,
        deviceLocalProtectionKey: ctx.values.deviceLocalProtectionKey,
        vaultTrustAnchor: ctx.values.vaultTrustAnchor,
      },
      ctx.values.localKeysProtectionKey,
    );
    expect(ctx.ports.crypto.createDeviceVaultKeyEnvelope).toHaveBeenCalledWith(
      ctx.values.vaultMasterKey,
      ctx.values.devicePublicVaultKey,
      {
        vaultId: ctx.values.vaultId,
        deviceId: ctx.values.deviceId,
        vaultKeyGeneration: 1,
        algorithmSuiteId: "spm-v1",
      },
    );
  });

  it.each(["revision", "generation", "public key"] as const)(
    "atomically rejects initialized access records with an invalid %s",
    async (invalidPart) => {
      const source = createInitializeVaultTestContext();
      await source.useCase.execute({
        masterPassword: source.values.masterPassword,
        deviceName: "Laptop",
      });
      const initializedParams = vi.mocked(
        source.ports.vaultLocalRepository.saveInitializedLocalVault,
      ).mock.calls[0]?.[0];

      if (initializedParams === undefined) {
        throw new Error("Expected initialized vault records.");
      }

      const ctx = createInitializeVaultTestContext();
      const save = ctx.ports.vaultLocalRepository.saveInitializedLocalVault({
        ...initializedParams,
        deviceAccessMaterial: {
          ...initializedParams.deviceAccessMaterial,
          revision:
            invalidPart === "revision"
              ? initializedParams.deviceAccessMaterial.revision + 1
              : initializedParams.deviceAccessMaterial.revision,
        },
        deviceAccessRecoveryBackup: {
          ...initializedParams.deviceAccessRecoveryBackup,
          localAccessGenerationId:
            invalidPart === "generation"
              ? ctx.values.replacementLocalAccessGenerationId
              : initializedParams.deviceAccessRecoveryBackup
                  .localAccessGenerationId,
          devicePublicSignKey:
            invalidPart === "public key"
              ? (new Uint8Array([1])
                  .buffer as typeof initializedParams.deviceAccessRecoveryBackup.devicePublicSignKey)
              : initializedParams.deviceAccessRecoveryBackup
                  .devicePublicSignKey,
        },
      });

      await expect(save).rejects.toBeInstanceOf(
        DeviceAccessMaterialChangedError,
      );
      expect(ctx.saved.localVaultDescriptor).toBeUndefined();
      expect(ctx.saved.deviceAccessMaterial).toBeUndefined();
      expect(ctx.saved.deviceAccessRecoveryBackup).toBeUndefined();
      expect(ctx.saved.vaultSnapshot).toBeUndefined();
    },
  );

  it("removes initialized local state when session activation fails", async () => {
    const ctx = createInitializeVaultTestContext();
    vi.mocked(
      ctx.ports.sessionServices.unlockedVaultSession.activate,
    ).mockRejectedValue(new Error("session failed"));

    await expect(
      ctx.useCase.execute({
        masterPassword: ctx.values.masterPassword,
        deviceName: "Laptop",
      }),
    ).rejects.toThrow("session failed");

    expect(
      ctx.ports.vaultLocalRepository.removePersistedLocalVault,
    ).toHaveBeenCalledWith(ctx.values.vaultId);
  });
});
