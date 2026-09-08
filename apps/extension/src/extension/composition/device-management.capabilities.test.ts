// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  completeDeviceEnrollment,
  composeDeviceManagement,
} from "./device-management.capabilities";

const fake = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("./first-launch.capabilities", () => ({ getApplication: fake.get }));
vi.mock("../../adapters/device", () => ({
  JsonTextDeviceEnrollmentTransport: class {
    async parseDeviceEnrollmentResponse() {
      return { vaultId: "vault" };
    }
  },
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});
it("refreshes same-session device changes and focus, but invalidates replaced sessions and cleans subscriptions", () => {
  const addListener = vi.fn();
  const removeListener = vi.fn();
  vi.stubGlobal("chrome", {
    permissions: { request: vi.fn(), contains: vi.fn() },
    storage: { onChanged: { addListener, removeListener } },
  });
  const listener = vi.fn();
  const unsubscribe = composeDeviceManagement().subscribe(listener);
  const change = addListener.mock.calls[0][0];
  const previous = { sessionId: "session", sourceSnapshotRevision: 1 };
  change(
    {
      unlockedVaultSessionMaterial: {
        oldValue: previous,
        newValue: { ...previous, sourceSnapshotRevision: 2 },
      },
    },
    "session",
  );
  expect(listener).toHaveBeenLastCalledWith(false);
  window.dispatchEvent(new Event("focus"));
  expect(listener).toHaveBeenCalledTimes(2);
  expect(listener).toHaveBeenLastCalledWith(false);
  change({ unlockedVaultSessionMaterial: { oldValue: previous } }, "session");
  expect(listener).toHaveBeenLastCalledWith(true);
  window.dispatchEvent(new Event("pagehide"));
  expect(listener).toHaveBeenLastCalledWith("pagehide");
  unsubscribe();
  expect(removeListener).toHaveBeenCalledWith(change);
  listener.mockClear();
  window.dispatchEvent(new Event("focus"));
  window.dispatchEvent(new Event("pagehide"));
  expect(listener).not.toHaveBeenCalled();
});

it("uses this browser's saved name without changing other devices' shared names", async () => {
  vi.stubGlobal("chrome", {
    permissions: { request: vi.fn(), contains: vi.fn() },
    storage: {
      local: {
        get: async () => ({
          "vault-setup:vault": {
            deviceName: "Renamed browser",
            duration: 600000,
            complete: true,
            token: "receipt",
          },
        }),
      },
    },
  });
  const devices = [
    { id: "current", name: "Original browser", state: "current" },
    { id: "other", name: "Other laptop", state: "other" },
  ];
  fake.get.mockResolvedValue({
    readDeviceManagement: {
      execute: async () => ({
        vaultId: "vault",
        currentDeviceId: "current",
        devices,
      }),
    },
    getSyncConfiguration: { execute: async () => ({ target: null }) },
  });
  const result = await composeDeviceManagement().inspect("vault");
  expect(result.devices.map((device) => device.name)).toEqual([
    "Renamed browser",
    "Other laptop",
  ]);
  expect(devices[0].name).toBe("Original browser");
});

it("returns committed enrollment words without fallible follow-up reads", async () => {
  const words = Array.from({ length: 24 }, (_, i) => `word${i}`);
  const list = vi
    .fn()
    .mockResolvedValueOnce({ vaults: [] })
    .mockRejectedValue(new Error("Local read unavailable"));
  const status = vi
    .fn()
    .mockRejectedValue(new Error("Session read unavailable"));
  const perform = vi.fn().mockResolvedValue({
    displayName: "Connected vault",
    recoveryMnemonicKey: { words },
    syncUpload: "pending",
  });
  fake.get.mockResolvedValue({
    listLocalVaults: { execute: list },
    getVaultSessionStatus: { execute: status },
    performDeviceEnrollment: { execute: perform },
  });
  const beforeActivation = vi.fn(async () => {});
  const result = await completeDeviceEnrollment(
    {
      approval: "fixture approval",
      password: "fixture password",
      deviceName: "Laptop",
      duration: 600_000,
    },
    beforeActivation,
  );
  expect(result).toEqual({
    vaultId: "vault",
    name: "Connected vault",
    words,
    syncUpload: "pending",
  });
  expect(beforeActivation).toHaveBeenCalledWith("vault");
  expect(list).toHaveBeenCalledTimes(1);
  expect(status).not.toHaveBeenCalled();
  expect(perform).toHaveBeenCalledTimes(1);
});
