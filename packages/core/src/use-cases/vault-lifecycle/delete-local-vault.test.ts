import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import { DeleteLocalVaultUseCase } from "./delete-local-vault";
import { VaultMustBeUnlockedForLocalDeletionError } from "../../errors/delete-local-vault.errors";

function createContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  const useCase = new DeleteLocalVaultUseCase(
    ports.vaultLocalRepository,
    ports.sessionServices.unlockedVaultSession,
  );

  ports.saved.unlockedVaultSession = {
    unlockedVault: {
      vaultId: values.vaultId,
      deviceId: values.deviceId,
      vault: values.decryptedVault,
      vaultMasterKey: values.vaultMasterKey,
      devicePrivateSignKey: values.devicePrivateSignKey,
    },
    sourceSnapshotVersionVector: {
      [values.deviceId]: 1,
    },
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
      ctx.ports.sessionServices.unlockedVaultSession.remove,
    ).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(ctx.ports.sessionServices.unlockedVaultSession.remove).mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(ctx.ports.vaultLocalRepository.removePersistedLocalVault).mock
        .invocationCallOrder[0],
    );
  });

  it("fails when no vault is unlocked", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSession = undefined;

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
      }),
    ).rejects.toBeInstanceOf(VaultMustBeUnlockedForLocalDeletionError);

    expect(
      ctx.ports.vaultLocalRepository.removePersistedLocalVault,
    ).not.toHaveBeenCalled();
    expect(
      ctx.ports.sessionServices.unlockedVaultSession.remove,
    ).not.toHaveBeenCalled();
  });

  it("fails when another vault is unlocked", async () => {
    const ctx = createContext();
    ctx.ports.saved.unlockedVaultSession = {
      ...ctx.ports.saved.unlockedVaultSession!,
      unlockedVault: {
        ...ctx.ports.saved.unlockedVaultSession!.unlockedVault,
        vaultId: "another-vault-id",
      },
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
      ctx.ports.sessionServices.unlockedVaultSession.remove,
    ).not.toHaveBeenCalled();
  });

  it("bubbles persisted local deletion errors after removing unlocked state", async () => {
    const ctx = createContext();
    const error = new Error("persisted local deletion failed");

    vi.mocked(
      ctx.ports.vaultLocalRepository.removePersistedLocalVault,
    ).mockRejectedValueOnce(error);

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
      }),
    ).rejects.toBe(error);

    expect(
      ctx.ports.sessionServices.unlockedVaultSession.remove,
    ).toHaveBeenCalledTimes(1);
    expect(ctx.ports.saved.unlockedVaultSession).toBeUndefined();
  });

  it("does not remove persisted local vault when unlocked state cleanup fails", async () => {
    const ctx = createContext();
    const error = new Error("session cleanup failed");

    vi.mocked(
      ctx.ports.sessionServices.unlockedVaultSession.remove,
    ).mockRejectedValueOnce(error);

    await expect(
      ctx.useCase.execute({
        vaultId: ctx.values.vaultId,
      }),
    ).rejects.toBe(error);

    expect(
      ctx.ports.vaultLocalRepository.removePersistedLocalVault,
    ).not.toHaveBeenCalled();
  });
});
