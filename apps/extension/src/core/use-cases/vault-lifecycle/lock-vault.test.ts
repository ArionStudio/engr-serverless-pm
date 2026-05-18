import { describe, expect, it, vi } from "vitest";
import { createCoreTestPorts } from "../../__tests__/fixtures/ports";
import { createCoreTestValues } from "../../__tests__/fixtures/values";
import { LockVaultUseCase } from "./lock-vault";

function createContext() {
  const values = createCoreTestValues();
  const ports = createCoreTestPorts(values);
  const useCase = new LockVaultUseCase(ports.unlockedVaultRepository);

  return {
    ports,
    useCase,
  };
}

describe("LockVaultUseCase", () => {
  it("removes the unlocked vault state", async () => {
    const ctx = createContext();

    await expect(ctx.useCase.execute()).resolves.toBeUndefined();

    expect(
      ctx.ports.unlockedVaultRepository.removeUnlockedVault,
    ).toHaveBeenCalledTimes(1);
  });

  it("bubbles repository errors", async () => {
    const ctx = createContext();
    const error = new Error("lock failed");

    vi.mocked(
      ctx.ports.unlockedVaultRepository.removeUnlockedVault,
    ).mockRejectedValueOnce(error);

    await expect(ctx.useCase.execute()).rejects.toThrow(error);
  });
});
