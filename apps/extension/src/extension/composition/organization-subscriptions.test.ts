// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import { composeFolderManagement } from "./folder-management.capabilities";
import { composeTagManagement } from "./tag-management.capabilities";

vi.mock("./first-launch.capabilities", () => ({ getApplication: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

it.each([composeFolderManagement, composeTagManagement])(
  "refreshes organization after a same-session sync commit and removes its listeners (%#)",
  (compose) => {
    type StorageListener = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => void;
    const storageListeners = new Set<StorageListener>();
    const close = vi.fn();
    vi.stubGlobal(
      "BroadcastChannel",
      class {
        onmessage: (() => void) | null = null;
        close = close;
      },
    );
    vi.stubGlobal("chrome", {
      storage: {
        onChanged: {
          addListener: (listener: StorageListener) =>
            storageListeners.add(listener),
          removeListener: (listener: StorageListener) =>
            storageListeners.delete(listener),
        },
      },
    });
    const listener = vi.fn();
    const unsubscribe = compose().subscribe(listener);
    const previous = {
      sessionId: "session",
      sourceSnapshotVersionVector: { device: 1 },
    };
    const emit = () =>
      storageListeners.forEach((notify) =>
        notify(
          {
            unlockedVaultSessionMaterial: {
              oldValue: previous,
              newValue: {
                ...previous,
                sourceSnapshotVersionVector: { device: 2 },
              },
            },
          },
          "session",
        ),
      );
    emit();
    expect(listener).toHaveBeenCalledOnce();
    window.dispatchEvent(new Event("focus"));
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    expect(close).toHaveBeenCalledOnce();
    listener.mockClear();
    emit();
    window.dispatchEvent(new Event("focus"));
    expect(listener).not.toHaveBeenCalled();
  },
);
