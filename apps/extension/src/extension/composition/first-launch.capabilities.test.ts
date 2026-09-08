import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
afterEach(() => vi.unstubAllGlobals());
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
  it("opens a fixed internal Options destination in a new tab", async () => {
    const create = vi.fn(async () => ({}));
    vi.stubGlobal("chrome", {
      runtime: {
        getURL: (path: string) => `chrome-extension://lfspm/${path}`,
        getContexts: vi.fn(async () => []),
      },
      tabs: { create },
      windows: { update: vi.fn() },
    });
    const { openOptionsPage } = await import("./first-launch.capabilities");
    await openOptionsPage("tools");
    expect(create).toHaveBeenCalledWith({
      url: "chrome-extension://lfspm/options.html#tools",
    });
  });
  it("routes an existing Options tab instead of opening a duplicate", async () => {
    const create = vi.fn(async () => ({}));
    const updateTab = vi.fn(async () => ({}));
    const updateWindow = vi.fn(async () => ({}));
    const sendMessage = vi.fn(async () => undefined);
    vi.stubGlobal("chrome", {
      runtime: {
        getURL: (path: string) => `chrome-extension://lfspm/${path}`,
        getContexts: vi.fn(async () => [
          {
            contextType: "TAB",
            contextId: "options-context",
            documentUrl: "chrome-extension://lfspm/options.html#sync",
            tabId: 14,
            windowId: 7,
          },
        ]),
        sendMessage,
      },
      tabs: { create, update: updateTab },
      windows: { update: updateWindow },
    });
    const { openOptionsPage } = await import("./first-launch.capabilities");
    await openOptionsPage("add-entry");
    expect(create).not.toHaveBeenCalled();
    expect(updateTab).toHaveBeenCalledWith(14, {
      active: true,
      url: "chrome-extension://lfspm/options.html#add-entry",
    });
    expect(updateWindow).toHaveBeenCalledWith(7, { focused: true });
    expect(sendMessage).toHaveBeenCalledWith({
      type: "lfspm:options-route",
      route: "add-entry",
    });
  });
});
