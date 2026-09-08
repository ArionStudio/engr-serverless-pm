// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createChromeStorageArea } from "../../__tests__/fixtures/chrome-storage-area";
import { composeVaultSettings } from "./vault-settings.capabilities";

const fake = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("./first-launch.capabilities", () => ({ getApplication: fake.get }));
const readWorkspace = vi.fn();
const changePassword = vi.fn();
const removeVault = vi.fn();
let activeVaultId: string | undefined;
let storage: ReturnType<typeof createChromeStorageArea>;
beforeEach(() => {
  vi.clearAllMocks();
  activeVaultId = "vault-one";
  storage = createChromeStorageArea();
  vi.stubGlobal("chrome", { storage: { local: storage.storageArea } });
  vi.stubGlobal("navigator", {
    locks: {
      request: (_key: string, operation: () => Promise<unknown>) => operation(),
    },
  });
  fake.get.mockResolvedValue({
    getVaultSessionStatus: {
      execute: async () =>
        activeVaultId
          ? { status: "unlocked", vaultId: activeVaultId }
          : { status: "locked" },
    },
    readVaultWorkspace: { execute: readWorkspace },
    changeMasterPassword: { execute: changePassword },
    deleteLocalVault: { execute: removeVault },
  });
  readWorkspace.mockImplementation(async ({ vaultId }: { vaultId: string }) => {
    if (vaultId !== activeVaultId) throw new Error("Unlock this vault first");
    return {};
  });
  changePassword.mockResolvedValue(undefined);
  removeVault.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());
describe("vault settings capabilities", () => {
  it("inspects authorization for the selected vault", async () => {
    const settings = composeVaultSettings();
    await expect(
      settings.inspectAuthorization("vault-one"),
    ).resolves.toBeUndefined();
    activeVaultId = "another-vault";
    await expect(settings.inspectAuthorization("vault-one")).rejects.toThrow(
      "Unlock this vault first",
    );
  });
  it("rejects settings authorization when session status exists but its payload cannot be restored", async () => {
    const settings = composeVaultSettings();
    readWorkspace.mockRejectedValue(
      new Error("Encrypted session payload unavailable"),
    );
    await expect(settings.inspectAuthorization("vault-one")).rejects.toThrow(
      "Encrypted session payload unavailable",
    );
    await expect(
      settings.saveDevice("vault-one", "Laptop", 600000),
    ).rejects.toThrow("Encrypted session payload unavailable");
    expect(await storage.storageArea.get("vault-setup:vault-one")).toEqual({});
  });
  it("checks the selected active vault before changing credentials or deleting data", async () => {
    const settings = composeVaultSettings();
    activeVaultId = "another-vault";
    await expect(
      settings.changePassword("vault-one", "old", "new"),
    ).rejects.toThrow("Unlock this vault first");
    await expect(settings.removeLocalVault("vault-one")).rejects.toThrow(
      "Unlock this vault first",
    );
    expect(changePassword).not.toHaveBeenCalled();
    expect(removeVault).not.toHaveBeenCalled();
  });
  it("updates only local name and supported duration while preserving recovery receipts", async () => {
    await storage.storageArea.set({
      "vault-setup:vault-one": {
        deviceName: "Old",
        duration: 600000,
        complete: true,
        token: "receipt",
      },
    });
    const settings = composeVaultSettings();
    await expect(
      settings.saveDevice("vault-one", "", 600000),
    ).rejects.toThrow();
    await expect(
      settings.saveDevice("vault-one", "Laptop", 123),
    ).rejects.toThrow();
    await settings.saveDevice("vault-one", "  Laptop  ", 600000);
    expect(
      (await storage.storageArea.get("vault-setup:vault-one"))[
        "vault-setup:vault-one"
      ],
    ).toEqual({
      deviceName: "Laptop",
      duration: 600000,
      complete: true,
      token: "receipt",
    });
  });
  it("deletes only the selected vault and its local preferences", async () => {
    await storage.storageArea.set({
      "vault-setup:vault-one": { token: "one" },
      "vault-setup:other": { token: "two" },
    });
    await composeVaultSettings().removeLocalVault("vault-one");
    expect(removeVault).toHaveBeenCalledWith({ vaultId: "vault-one" });
    expect(
      (await storage.storageArea.get("vault-setup:other"))["vault-setup:other"],
    ).toEqual({ token: "two" });
    expect(
      (await storage.storageArea.get("vault-setup:vault-one"))[
        "vault-setup:vault-one"
      ],
    ).toBeUndefined();
  });
});
