import { afterEach, describe, expect, it, vi } from "vitest";
import { composeSiteIcons } from "./site-icons";

function browser(supported = true) {
  const state = { enabled: false, granted: false };
  const storageListeners = new Set<() => void>();
  const permissionAddedListeners = new Set<() => void>();
  const permissionRemovedListeners = new Set<
    (value: chrome.permissions.Permissions) => void
  >();
  const event = (listeners: Set<() => void>) => ({
    addListener: (fn: () => void) => listeners.add(fn),
    removeListener: (fn: () => void) => listeners.delete(fn),
  });
  const permissionRemovedEvent = {
    addListener: (fn: (value: chrome.permissions.Permissions) => void) =>
      permissionRemovedListeners.add(fn),
    removeListener: (fn: (value: chrome.permissions.Permissions) => void) =>
      permissionRemovedListeners.delete(fn),
  };
  let lockTail = Promise.resolve();
  const requestLock = vi.fn(
    async (_name: string, operation: () => Promise<unknown>) => {
      const previous = lockTail;
      let release = () => {};
      lockTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await operation();
      } finally {
        release();
      }
    },
  );
  const request = vi.fn(async () => state.granted);
  const write = vi.fn(async (value: { siteIconsEnabled: boolean }) => {
    state.enabled = value.siteIconsEnabled;
  });
  const remove = vi.fn(async () => {
    state.granted = false;
    return true;
  });
  const contains = vi.fn(async () => state.granted);
  vi.stubGlobal("chrome", {
    runtime: {
      getManifest: () => ({
        optional_permissions: supported ? ["favicon"] : [],
      }),
      getURL: (path: string) => `chrome-extension://test${path}`,
    },
    storage: {
      local: {
        get: async () => ({ siteIconsEnabled: state.enabled }),
        set: write,
      },
      onChanged: event(storageListeners),
    },
    permissions: {
      contains,
      request,
      remove,
      onAdded: event(permissionAddedListeners),
      onRemoved: permissionRemovedEvent,
    },
  });
  vi.stubGlobal("navigator", { locks: { request: requestLock } });
  return {
    state,
    request,
    write,
    remove,
    contains,
    requestLock,
    firePermissionRemoved() {
      state.granted = false;
      for (const listener of permissionRemovedListeners)
        listener({ permissions: ["favicon"] });
    },
  };
}
afterEach(() => vi.unstubAllGlobals());
describe("browser site icons", () => {
  it("requires both opt-in and permission, and preserves opt-out after denial", async () => {
    const { state, request, write } = browser();
    const icons = composeSiteIcons();
    expect(await icons.read()).toEqual({
      supported: true,
      enabled: false,
      cleanupRequired: false,
    });
    expect(request).not.toHaveBeenCalled();
    await expect(icons.setEnabled(true)).rejects.toMatchObject({
      name: "SiteIconPermissionDeniedError",
    });
    expect(write).not.toHaveBeenCalled();
    state.granted = true;
    await icons.setEnabled(true);
    expect((await icons.read()).enabled).toBe(true);
    state.granted = false;
    expect((await icons.read()).enabled).toBe(false);
    state.granted = true;
    await icons.setEnabled(false);
    expect(state).toEqual({ enabled: false, granted: false });
  });
  it("only constructs extension-local, origin-only lookups and rejects unsafe URLs", () => {
    browser();
    const icons = composeSiteIcons();
    const source = new URL(
      icons.source("https://Example.com:8443/private?q=secret#fragment")!,
    );
    expect(source.protocol).toBe("chrome-extension:");
    expect(source.host).toBe("test");
    expect(source.searchParams.get("pageUrl")).toBe(
      "https://example.com:8443/",
    );
    for (const value of [
      "https://user:secret@example.com",
      "file:///tmp/x",
      "javascript:alert(1)",
      "not a url",
    ])
      expect(icons.source(value)).toBeUndefined();
  });
  it("uses initials without querying permissions on unsupported browsers", async () => {
    const { request } = browser(false);
    const icons = composeSiteIcons();
    expect(await icons.read()).toEqual({
      supported: false,
      enabled: false,
      cleanupRequired: false,
    });
    expect(icons.source("https://example.com")).toBeUndefined();
    await expect(icons.setEnabled(true)).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
  it("removes an unowned permission when preference persistence fails", async () => {
    const current = browser();
    current.state.granted = true;
    const icons = composeSiteIcons();
    current.write.mockRejectedValueOnce(new Error("Storage failed."));
    await expect(icons.setEnabled(true)).rejects.toThrow("Storage failed.");
    expect(current.request).toHaveBeenCalledOnce();
    expect(current.remove).toHaveBeenCalledOnce();
    expect(current.state.granted).toBe(false);
  });
  it("does not revoke a grant adopted by a concurrent successful enable", async () => {
    const current = browser();
    const firstContext = composeSiteIcons();
    const secondContext = composeSiteIcons();
    let grant = () => {};
    current.request.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          const previous = grant;
          grant = () => {
            previous();
            current.state.granted = true;
            resolve(true);
          };
        }),
    );
    current.write
      .mockImplementationOnce(async (value) => {
        current.state.enabled = value.siteIconsEnabled;
      })
      .mockRejectedValueOnce(new Error("Redundant write failed."));

    const first = firstContext.setEnabled(true);
    const second = secondContext.setEnabled(true);
    grant();

    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeUndefined();
    expect(current.write).toHaveBeenCalledOnce();
    expect(current.remove).not.toHaveBeenCalled();
    expect(await secondContext.read()).toEqual({
      supported: true,
      enabled: true,
      cleanupRequired: false,
    });
  });
  it.each([
    {
      failure: "permission recheck",
      arrange(current: ReturnType<typeof browser>) {
        current.contains.mockRejectedValueOnce(
          new Error("Permission query failed."),
        );
      },
      expectedName: "Error",
      cleanupRequired: false,
    },
    {
      failure: "lock acquisition",
      arrange(current: ReturnType<typeof browser>) {
        current.requestLock.mockRejectedValue(new Error("Lock failed."));
      },
      expectedName: "SiteIconCleanupError",
      cleanupRequired: true,
    },
  ])(
    "cleans up or classifies retry after $failure fails following a grant",
    async ({ arrange, expectedName, cleanupRequired }) => {
      const current = browser();
      const icons = composeSiteIcons();
      current.request.mockImplementationOnce(async () => {
        current.state.granted = true;
        return true;
      });
      arrange(current);

      await expect(
        icons.setEnabled(true).catch((cause: unknown) => cause),
      ).resolves.toMatchObject({ name: expectedName });
      expect(await icons.read()).toEqual({
        supported: true,
        enabled: false,
        cleanupRequired,
      });
    },
  );
  it("names a failed enable rollback and retains both causes", async () => {
    const current = browser();
    const icons = composeSiteIcons();
    const storageFailure = new Error("Storage failed.");
    current.request.mockImplementationOnce(async () => {
      current.state.granted = true;
      return true;
    });
    current.write.mockRejectedValueOnce(storageFailure);
    current.remove.mockImplementationOnce(async () => false);

    const failure = await icons
      .setEnabled(true)
      .catch((cause: unknown) => cause);

    expect(failure).toMatchObject({
      name: "SiteIconCleanupError",
      errors: [storageFailure, expect.any(Error)],
    });
    expect(current.state.granted).toBe(true);
  });
  it("reports permission removal and stops after unsubscribing", async () => {
    const current = browser();
    current.state.enabled = true;
    current.state.granted = true;
    const icons = composeSiteIcons();
    const listener = vi.fn();
    const unsubscribe = icons.subscribe(listener);

    current.firePermissionRemoved();

    expect(listener).toHaveBeenCalledOnce();
    expect(await icons.read()).toEqual({
      supported: true,
      enabled: false,
      cleanupRequired: true,
    });
    unsubscribe();
    current.firePermissionRemoved();
    expect(listener).toHaveBeenCalledOnce();
  });
  it("does not report a concurrent enable as successful after disable removes permission", async () => {
    const current = browser();
    current.state.enabled = true;
    current.state.granted = true;
    const firstContext = composeSiteIcons();
    const secondContext = composeSiteIcons();
    let finishRemoval = () => {};
    current.remove.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finishRemoval = () => {
            current.state.granted = false;
            resolve(true);
          };
        }),
    );

    const disable = firstContext.setEnabled(false);
    await vi.waitFor(() => expect(current.remove).toHaveBeenCalledOnce());
    const enable = secondContext.setEnabled(true);
    expect(current.request).toHaveBeenCalledOnce();
    finishRemoval();

    await disable;
    await expect(enable).rejects.toThrow(
      "Browser icon permission changed before enabling.",
    );
    expect(await secondContext.read()).toEqual({
      supported: true,
      enabled: false,
      cleanupRequired: false,
    });
    expect(current.write).not.toHaveBeenCalledWith({ siteIconsEnabled: true });
  });
  it.each(["permission", "preference"] as const)(
    "reports incomplete disable cleanup when %s cleanup fails",
    async (failure) => {
      const current = browser();
      current.state.enabled = true;
      current.state.granted = true;
      const icons = composeSiteIcons();
      if (failure === "permission")
        current.remove.mockImplementationOnce(async () => false);
      else
        current.write.mockRejectedValueOnce(
          new Error("Preference write failed."),
        );

      await expect(icons.setEnabled(false)).rejects.toMatchObject({
        name: "SiteIconCleanupError",
        message: "Browser icons could not be fully disabled.",
      });
      expect(current.write).toHaveBeenCalledWith({ siteIconsEnabled: false });
      expect(current.remove).toHaveBeenCalledOnce();
      expect(await icons.read()).toEqual({
        supported: true,
        enabled: false,
        cleanupRequired: true,
      });
    },
  );
});
