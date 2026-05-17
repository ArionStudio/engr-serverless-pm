import { describe, expect, it, vi } from "vitest";
import type { LocalVaultDescriptor } from "../../domain/vault/local-vault-descriptor";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import { ListLocalVaultsUseCase } from "../list-local-vaults";

function createContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  const useCase = new ListLocalVaultsUseCase(ports.vaultLocalRepository);

  return {
    values,
    ports,
    useCase,
  };
}

describe("ListLocalVaultsUseCase", () => {
  it("returns local vault descriptors from repository", async () => {
    const ctx = createContext();
    const vaults: LocalVaultDescriptor[] = [
      {
        vaultId: ctx.values.vaultId,
        displayName: ctx.values.vaultDisplayName,
        createdAt: ctx.values.timestamp,
      },
    ];

    vi.mocked(
      ctx.ports.vaultLocalRepository.listLocalVaultDescriptors,
    ).mockResolvedValueOnce(vaults);

    await expect(ctx.useCase.execute()).resolves.toEqual({
      vaults,
    });

    expect(
      ctx.ports.vaultLocalRepository.listLocalVaultDescriptors,
    ).toHaveBeenCalledTimes(1);
  });

  it("bubbles repository errors", async () => {
    const ctx = createContext();
    const error = new Error("list failed");

    vi.mocked(
      ctx.ports.vaultLocalRepository.listLocalVaultDescriptors,
    ).mockRejectedValueOnce(error);

    await expect(ctx.useCase.execute()).rejects.toThrow(error);
  });
});
