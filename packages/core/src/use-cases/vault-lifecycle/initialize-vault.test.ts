import { describe, expect, it, vi } from "vitest";
import { createInitializeVaultTestContext } from "../../__tests__/fixtures/initialize-vault";
import type { RawMasterPassword } from "../../domain/master-password";
import { InvalidNewMasterPasswordError } from "../../errors/master-password.errors";

describe("InitializeVaultUseCase", () => {
  it("rejects a short master password before generating IDs", async () => {
    const ctx = createInitializeVaultTestContext();

    await expect(
      ctx.useCase.execute({
        masterPassword: "12345678901" as RawMasterPassword,
        deviceName: "Laptop",
      }),
    ).rejects.toBeInstanceOf(InvalidNewMasterPasswordError);

    expect(ctx.ports.ids.generateId).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.saveInitializedLocalVault,
    ).not.toHaveBeenCalled();
  });

  it("accepts a master password at the minimum length", async () => {
    const ctx = createInitializeVaultTestContext();
    const masterPassword = "123456789012" as RawMasterPassword;

    await ctx.useCase.execute({ masterPassword, deviceName: "Laptop" });

    expect(ctx.ports.crypto.deriveLocalRootKey).toHaveBeenCalledWith(
      masterPassword,
      ctx.values.masterPasswordSalt,
    );
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
      devicePublicSignKey: ctx.values.devicePublicSignKey,
      devicePublicVaultKey: ctx.values.devicePublicVaultKey,
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
