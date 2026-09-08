// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  capturedLoginSessionRetentionEnabled,
  installCapturedLoginSessionCleanup,
  loginDetectionOrigins,
  reconcileClosedTabCaptures,
  reconcileLoginDetection,
  setCapturedLoginSessionRetention,
  setLoginDetection,
} from "./login-detection";
import { installLoginFieldMonitor } from "../content/login-field-monitor";
beforeEach(() => {
  vi.stubGlobal("navigator", {
    locks: {
      request: async (_name: string, operation: () => Promise<unknown>) =>
        operation(),
    },
  });
});
afterEach(() => vi.unstubAllGlobals());
function capturedEnvelope(sessionId: string, id: string) {
  return {
    id,
    expiresAt: null,
    vaultId: "vault",
    sessionId,
    iv: Array<number>(12).fill(0),
    ciphertext: Array<number>(16).fill(0),
  };
}
it("turns off capture in existing documents when website permission is revoked", async () => {
  let enabled = true;
  const listeners: ((
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => void)[] = [];
  const set = vi.fn(async (value: { loginDetectionEnabled: boolean }) => {
    const oldValue = enabled;
    enabled = value.loginDetectionEnabled;
    for (const listener of listeners)
      listener(
        { loginDetectionEnabled: { oldValue, newValue: enabled } },
        "local",
      );
  });
  const unregister = vi.fn(async () => {});
  vi.stubGlobal("chrome", {
    permissions: { contains: vi.fn(async () => false) },
    storage: {
      session: { get: vi.fn(async () => ({})), remove: vi.fn(async () => {}) },
      local: {
        get: vi.fn(async () => ({ loginDetectionEnabled: enabled })),
        set,
      },
      onChanged: {
        addListener: (listener: (typeof listeners)[number]) =>
          listeners.push(listener),
      },
    },
    scripting: {
      getRegisteredContentScripts: vi.fn(async () => [
        { id: "lfspm-login-detection" },
      ]),
      unregisterContentScripts: unregister,
    },
  });
  const detectionEnabled = installLoginFieldMonitor();
  await Promise.resolve();
  expect(detectionEnabled()).toBe(true);
  await reconcileLoginDetection();
  expect(detectionEnabled()).toBe(false);
  expect(unregister).toHaveBeenCalledWith({ ids: ["lfspm-login-detection"] });
});
it("explains an unloaded manifest update before requesting an undeclared permission", async () => {
  const request = vi.fn();
  vi.stubGlobal("chrome", {
    runtime: {
      getManifest: () => ({
        optional_host_permissions: ["https://*.amazonaws.com/*"],
      }),
    },
    permissions: { request },
  });
  await expect(setLoginDetection(true)).rejects.toThrow("Reload LFSPM");
  expect(request).not.toHaveBeenCalled();
});

it("keeps detection disabled when content-script registration fails", async () => {
  let enabled = false;
  vi.stubGlobal("chrome", {
    runtime: {
      getManifest: () => ({ optional_host_permissions: loginDetectionOrigins }),
    },
    permissions: { request: vi.fn(async () => true) },
    storage: {
      local: {
        get: vi.fn(async () => ({ loginDetectionEnabled: enabled })),
        set: vi.fn(async (value: { loginDetectionEnabled: boolean }) => {
          enabled = value.loginDetectionEnabled;
        }),
      },
    },
    scripting: {
      getRegisteredContentScripts: vi.fn(async () => []),
      registerContentScripts: vi.fn(async () => {
        throw new Error("registration failed");
      }),
    },
  });

  await expect(setLoginDetection(true)).rejects.toThrow("registration failed");
  expect(enabled).toBe(false);
});

it("serializes reconciliation so concurrent calls register one content script", async () => {
  let previous = Promise.resolve();
  vi.stubGlobal("navigator", {
    locks: {
      request: (_name: string, operation: () => Promise<unknown>) => {
        const result = previous.then(operation);
        previous = result.then(
          () => undefined,
          () => undefined,
        );
        return result;
      },
    },
  });
  let registered = false;
  const registerContentScripts = vi.fn(async () => {
    await Promise.resolve();
    registered = true;
  });
  vi.stubGlobal("chrome", {
    permissions: { contains: vi.fn(async () => true) },
    storage: {
      local: {
        get: vi.fn(async () => ({ loginDetectionEnabled: true })),
      },
    },
    scripting: {
      getRegisteredContentScripts: vi.fn(async () =>
        registered ? [{ id: "lfspm-login-detection" }] : [],
      ),
      registerContentScripts,
    },
  });

  await Promise.all([reconcileLoginDetection(), reconcileLoginDetection()]);
  expect(registerContentScripts).toHaveBeenCalledTimes(1);
});

it("attaches detection to an already-open eligible tab after permission is granted", async () => {
  const executeScript = vi.fn(async () => []);
  vi.stubGlobal("chrome", {
    runtime: {
      getManifest: () => ({
        optional_host_permissions: [
          "https://*/*",
          "http://localhost/*",
          "http://127.0.0.1/*",
          "http://[::1]/*",
        ],
      }),
    },
    permissions: {
      request: vi.fn(async () => true),
      contains: vi.fn(async () => true),
    },
    storage: {
      session: { get: vi.fn(async () => ({})), remove: vi.fn(async () => {}) },
      local: {
        set: vi.fn(async () => {}),
        get: vi.fn(async () => ({ loginDetectionEnabled: true })),
      },
    },
    scripting: {
      getRegisteredContentScripts: vi.fn(async () => []),
      registerContentScripts: vi.fn(async () => {}),
      executeScript,
    },
    tabs: {
      query: vi.fn(async () => [
        { id: 7, url: "https://xrbazaar.com/sign-in" },
        { id: 8, url: "chrome://extensions" },
        { id: 9, url: "http://[::1]:8080/login" },
        { id: 10, url: "http://other.example/login" },
        { id: 11, url: "http://localhost:443@evil.example/login" },
      ]),
    },
  });
  await setLoginDetection(true);
  expect(executeScript).toHaveBeenCalledTimes(2);
  expect(executeScript).toHaveBeenCalledWith({
    target: { tabId: 7, frameIds: [0] },
    files: ["login-content.js"],
  });
  expect(executeScript).toHaveBeenCalledWith({
    target: { tabId: 9, frameIds: [0] },
    files: ["login-content.js"],
  });
});

it("defaults session retention off and clears indefinite captures when retention or detection is disabled", async () => {
  let settings: Record<string, unknown> = { loginDetectionEnabled: true };
  let stored: Record<string, unknown> = {
    "lfspm.captured-login.7": capturedEnvelope("session", "capture-7"),
    "lfspm.captured-login.8": {
      ...capturedEnvelope("session", "capture-8"),
      expiresAt: Date.now() + 120_000,
    },
  };
  const remove = vi.fn(async (keys: string[]) => {
    stored = Object.fromEntries(
      Object.entries(stored).filter(([name]) => !keys.includes(name)),
    );
  });
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: async () => settings,
        set: async (values: Record<string, unknown>) => {
          settings = { ...settings, ...values };
        },
      },
      session: { get: async () => stored, remove },
    },
    permissions: { contains: async () => true },
    scripting: { getRegisteredContentScripts: async () => [] },
  });
  expect(await capturedLoginSessionRetentionEnabled()).toBe(false);
  await setCapturedLoginSessionRetention(true);
  expect(await capturedLoginSessionRetentionEnabled()).toBe(true);
  expect(remove).not.toHaveBeenCalled();
  await setCapturedLoginSessionRetention(false);
  expect(stored).toEqual({});
  stored = {
    "lfspm.captured-login.9": capturedEnvelope("session", "capture-9"),
  };
  await setLoginDetection(false);
  expect(stored).toEqual({});
});

it("still stops detection and reports a failure when captured-login cleanup fails", async () => {
  let enabled = true;
  const unregisterContentScripts = vi.fn(async () => {});
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        set: vi.fn(async (value: { loginDetectionEnabled: boolean }) => {
          enabled = value.loginDetectionEnabled;
        }),
      },
      session: {
        get: vi.fn(async () => {
          throw new Error("cleanup failed");
        }),
      },
    },
    scripting: {
      getRegisteredContentScripts: vi.fn(async () => [
        { id: "lfspm-login-detection" },
      ]),
      unregisterContentScripts,
    },
  });

  await expect(setLoginDetection(false)).rejects.toThrow(
    "Login detection could not be fully disabled.",
  );
  expect(enabled).toBe(false);
  expect(unregisterContentScripts).toHaveBeenCalledWith({
    ids: ["lfspm-login-detection"],
  });
});

it("keeps retention enabled when clearing captures fails", async () => {
  const set = vi.fn();
  vi.stubGlobal("chrome", {
    storage: {
      local: { set },
      session: {
        get: vi.fn(async () => {
          throw new Error("cleanup failed");
        }),
      },
    },
  });

  await expect(setCapturedLoginSessionRetention(false)).rejects.toThrow(
    "cleanup failed",
  );
  expect(set).not.toHaveBeenCalled();
});

it("removes closed-tab captures and preserves all captures if tab enumeration fails", async () => {
  let stored: Record<string, unknown> = {
    "lfspm.captured-login.7": capturedEnvelope("session", "capture-7"),
    "lfspm.captured-login.8": capturedEnvelope("session", "capture-8"),
    "lfspm.captured-login.7e0": capturedEnvelope("session", "malformed-key"),
  };
  const remove = vi.fn(async (keys: string[]) => {
    stored = Object.fromEntries(
      Object.entries(stored).filter(([name]) => !keys.includes(name)),
    );
  });
  const query = vi
    .fn<() => Promise<chrome.tabs.Tab[]>>()
    .mockResolvedValueOnce([{ id: 7 } as chrome.tabs.Tab])
    .mockRejectedValueOnce(new Error("tabs unavailable"));
  vi.stubGlobal("chrome", {
    tabs: { query },
    storage: {
      session: { get: vi.fn(async () => stored), remove },
    },
  });

  await reconcileClosedTabCaptures();
  expect(stored).toEqual({
    "lfspm.captured-login.7": capturedEnvelope("session", "capture-7"),
  });
  stored["lfspm.captured-login.9"] = capturedEnvelope("session", "capture-9");
  await expect(reconcileClosedTabCaptures()).rejects.toThrow(
    "tabs unavailable",
  );
  expect(stored).toEqual({
    "lfspm.captured-login.7": capturedEnvelope("session", "capture-7"),
    "lfspm.captured-login.9": capturedEnvelope("session", "capture-9"),
  });
});

it("purges captures on lock or session replacement without an old event deleting a new session capture", async () => {
  const listeners: ((
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => void)[] = [];
  let stored: Record<string, unknown> = {
    unlockedVaultSessionMaterial: { sessionId: "new-session" },
    "lfspm.captured-login.7": capturedEnvelope("old-session", "capture-7"),
    "lfspm.captured-login.8": capturedEnvelope("new-session", "capture-8"),
  };
  vi.stubGlobal("chrome", {
    storage: {
      onChanged: {
        addListener: (listener: (typeof listeners)[number]) =>
          listeners.push(listener),
      },
      session: {
        get: async () => stored,
        remove: async (keys: string[]) => {
          stored = Object.fromEntries(
            Object.entries(stored).filter(([name]) => !keys.includes(name)),
          );
        },
      },
    },
  });
  installCapturedLoginSessionCleanup();
  listeners[0](
    {
      unlockedVaultSessionMaterial: { oldValue: { sessionId: "old-session" } },
    },
    "session",
  );
  await vi.waitFor(() =>
    expect(stored["lfspm.captured-login.7"]).toBeUndefined(),
  );
  expect(stored["lfspm.captured-login.8"]).toBeDefined();
  stored = Object.fromEntries(
    Object.entries(stored).filter(
      ([name]) => name !== "unlockedVaultSessionMaterial",
    ),
  );
  listeners[0](
    {
      unlockedVaultSessionMaterial: { oldValue: { sessionId: "new-session" } },
    },
    "session",
  );
  await vi.waitFor(() => expect(stored).toEqual({}));
});
