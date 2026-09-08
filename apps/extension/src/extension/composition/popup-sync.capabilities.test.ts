// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { getSyncConfiguration } = vi.hoisted(() => ({
  getSyncConfiguration: vi.fn(),
}));

vi.mock("./first-launch.capabilities", () => ({
  getApplication: async () => ({
    getSyncConfiguration: { execute: getSyncConfiguration },
  }),
}));

type PermissionListener = (change: chrome.permissions.Permissions) => void;
type StorageListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  area: string,
) => void;

function eventSource<Listener extends (...params: never[]) => void>() {
  const listeners = new Set<Listener>();
  return {
    event: {
      addListener: (listener: Listener) => listeners.add(listener),
      removeListener: (listener: Listener) => listeners.delete(listener),
    },
    emit: (...params: Parameters<Listener>) => {
      for (const listener of listeners) listener(...params);
    },
    size: () => listeners.size,
  };
}

const added = eventSource<PermissionListener>();
const removed = eventSource<PermissionListener>();
const storageChanged = eventSource<StorageListener>();

class BroadcastChannelStub {
  onmessage: ((event: MessageEvent) => void) | null = null;
  postMessage(): void {}
  close(): void {}
}

beforeEach(() => {
  getSyncConfiguration.mockReset().mockResolvedValue({
    target: {
      targetConfig: {
        bucket: "lfspm-backup",
        region: "eu-central-1",
        prefix: "vault/",
      },
    },
    snapshotVersionVector: { device: 1 },
    syncRemovalPending: false,
  });
  vi.stubGlobal("BroadcastChannel", BroadcastChannelStub);
  vi.stubGlobal("chrome", {
    permissions: {
      request: vi.fn(async () => true),
      contains: vi.fn(async () => false),
      onAdded: added.event,
      onRemoved: removed.event,
    },
    storage: { onChanged: storageChanged.event },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("refreshes popup sync for relevant permission changes and cleans up both subscriptions", async () => {
  const { composePopupSync } = await import("./popup-sync.capabilities");
  const capabilities = composePopupSync();
  await capabilities.inspect("vault");
  const reasons: string[] = [];
  const unsubscribe = capabilities.subscribe((reason) => reasons.push(reason));

  added.emit({ origins: ["https://example.com/*"] });
  expect(reasons).toEqual([]);

  added.emit({ origins: ["https://*/*"] });
  removed.emit({ origins: ["https://*.amazonaws.com/*"] });
  expect(reasons).toEqual(["data", "data"]);

  const unchangedSession = {
    unlockedVaultSessionMaterial: {
      oldValue: { sessionId: "session" },
      newValue: { sessionId: "session" },
    },
  };
  storageChanged.emit(unchangedSession, "session");
  expect(reasons).toEqual(["data", "data", "data"]);

  unsubscribe();
  added.emit({ origins: ["https://*/*"] });
  removed.emit({ origins: ["https://*/*"] });
  storageChanged.emit(unchangedSession, "session");
  expect(reasons).toEqual(["data", "data", "data"]);
  expect(added.size()).toBe(0);
  expect(removed.size()).toBe(0);
  expect(storageChanged.size()).toBe(0);
});
