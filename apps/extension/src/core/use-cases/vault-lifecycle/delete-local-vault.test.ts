import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import { DeleteLocalVaultUseCase } from "./delete-local-vault";
import { VaultMustBeUnlockedForLocalDeletionError } from "../__errors/delete-local-vault.errors";

function createContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  const useCase = new DeleteLocalVaultUseCase(
    ports.vaultLocalRepository,
    ports.unlockedVaultRepository,
  );

  ports.saved.unlockedVault = {
    vaultId: values.vaultId,
    deviceId: values.deviceId,
    vault: values.decryptedVault,
    vaultMasterKey: values.vaultMasterKey,
    devicePrivateSignKey: values.devicePrivateSignKey,
  };

  return {
    values,
    ports,
    useCase,
  };
}

describe("DeleteLocalVaultUseCase", () => {
  it("removes local vault data and unlocked state when the target vault is unlocked", async () => {
    const ctx = createContext();

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
      }),
    ).resolves.toBeUndefined();

    expect(
      ctx.ports.vaultLocalRepository.removePersistedLocalVault,
    ).toHaveBeenCalledWith(ctx.values.vaultId);
    expect(
      ctx.ports.vaultLocalRepository.removeLocalVaultDescriptor,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.removeDeviceAccessMaterial,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.vaultLocalRepository.removeVaultSnapshot,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.unlockedVaultRepository.removeUnlockedVault,
    ).toHaveBeenCalledTimes(1);
  });

  it("fails when no vault is unlocked", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVault = undefined;

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
      }),
    ).rejects.toBeInstanceOf(VaultMustBeUnlockedForLocalDeletionError);

    expect(
      ctx.ports.vaultLocalRepository.removePersistedLocalVault,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.unlockedVaultRepository.removeUnlockedVault,
    ).not.toHaveBeenCalled();
  });

  it("fails when another vault is unlocked", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVault = {
      ...ctx.ports.saved.unlockedVault!,
      vaultId: "another-vault-id",
    };

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
      }),
    ).rejects.toBeInstanceOf(VaultMustBeUnlockedForLocalDeletionError);

    expect(
      ctx.ports.vaultLocalRepository.removePersistedLocalVault,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.unlockedVaultRepository.removeUnlockedVault,
    ).not.toHaveBeenCalled();
  });

  it("does not remove unlocked state when persisted local deletion fails", async () => {
    const ctx = createContext();
    const error = new Error("persisted local deletion failed");

    vi.mocked(
      ctx.ports.vaultLocalRepository.removePersistedLocalVault,
    ).mockRejectedValueOnce(error);

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
      }),
    ).rejects.toThrow(error);

    expect(
      ctx.ports.unlockedVaultRepository.removeUnlockedVault,
    ).not.toHaveBeenCalled();
  });

  it("bubbles unlocked state cleanup errors after local deletion", async () => {
    const ctx = createContext();
    const error = new Error("session cleanup failed");

    vi.mocked(
      ctx.ports.unlockedVaultRepository.removeUnlockedVault,
    ).mockRejectedValueOnce(error);

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
      }),
    ).rejects.toThrow(error);

    expect(
      ctx.ports.vaultLocalRepository.removePersistedLocalVault,
    ).toHaveBeenCalledWith(ctx.values.vaultId);
  });
});
