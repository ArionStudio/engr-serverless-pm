import { beforeEach, describe, expect, it, vi } from "vitest";
const { compose, list, assess } = vi.hoisted(() => ({
  compose: vi.fn(),
  list: vi.fn(),
  assess: vi.fn(),
}));
vi.mock("./extension-application", () => ({
  composeExtensionApplication: compose,
}));
beforeEach(() => {
  vi.resetModules();
  compose.mockReset().mockReturnValue({
    listLocalVaults: { execute: list },
    checkPasswordStrength: { execute: assess },
  });
  list.mockReset().mockResolvedValue({ vaults: [{}] });
  assess.mockReset().mockResolvedValue({ score: 4 });
});
describe("first-launch application capabilities", () => {
  it("shares application initialization across concurrent capabilities", async () => {
    const { readLocalVaultCount, assessSetupPassword } =
      await import("./first-launch.capabilities");
    await expect(
      Promise.all([
        readLocalVaultCount(),
        assessSetupPassword("vault password"),
      ]),
    ).resolves.toEqual([1, { score: 4 }]);
    expect(compose).toHaveBeenCalledTimes(1);
    expect(assess).toHaveBeenCalledWith({ password: "vault password" });
  });
  it("retries failed initialization and shares the successful application", async () => {
    compose.mockImplementationOnce(() => {
      throw new Error("Startup failed");
    });
    const { readLocalVaultCount } = await import("./first-launch.capabilities");
    await expect(readLocalVaultCount()).rejects.toThrow("Startup failed");
    await expect(
      Promise.all([readLocalVaultCount(), readLocalVaultCount()]),
    ).resolves.toEqual([1, 1]);
    expect(compose).toHaveBeenCalledTimes(2);
  });
  it("retries a failed read without rebuilding the application", async () => {
    list.mockRejectedValueOnce(new Error("Storage failed"));
    const { readLocalVaultCount } = await import("./first-launch.capabilities");
    await expect(readLocalVaultCount()).rejects.toThrow("Storage failed");
    await expect(readLocalVaultCount()).resolves.toBe(1);
    expect(compose).toHaveBeenCalledTimes(1);
  });
});
