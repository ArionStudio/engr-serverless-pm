// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { usePopupSync } from "./use-popup-sync";
import { PopupSync } from "./popup-sync.view";
import { galleryPopupSync } from "@/gallery/popup-sync-fixture";
import type { PopupSyncCapabilities } from "./popup-sync.type";
afterEach(cleanup);

it("fetches once on mount, checks again manually, and shows the actual local version", async () => {
  const capabilities = galleryPopupSync();
  capabilities.review = vi.fn(capabilities.review);
  let notify: Parameters<PopupSyncCapabilities["subscribe"]>[0] = () => {};
  capabilities.subscribe = (listener) => {
    notify = listener;
    return () => {};
  };
  const view = render(
    <PopupSync
      vaultId="gallery-vault"
      capabilities={capabilities}
      onOpenOptions={() => {}}
    />,
  );
  await screen.findByText("Up to date with S3");
  expect(capabilities.review).toHaveBeenCalledTimes(1);
  expect(screen.getByText("desktop")).toBeTruthy();
  view.rerender(
    <PopupSync
      vaultId="gallery-vault"
      capabilities={capabilities}
      disabled
      onOpenOptions={() => {}}
    />,
  );
  act(() => notify("focus"));
  expect(capabilities.review).toHaveBeenCalledTimes(1);
  view.rerender(
    <PopupSync
      vaultId="gallery-vault"
      capabilities={capabilities}
      onOpenOptions={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Sync now" }));
  await waitFor(() => expect(capabilities.review).toHaveBeenCalledTimes(2));
  await screen.findByText("Up to date with S3");
});

it.each(["sync-off", "sync-permission"] as const)(
  "does not contact S3 for %s",
  async (scenario) => {
    const capabilities = galleryPopupSync(scenario);
    capabilities.review = vi.fn(capabilities.review);
    render(
      <PopupSync
        vaultId="gallery-vault"
        capabilities={capabilities}
        onOpenOptions={() => {}}
      />,
    );
    await screen.findByText(
      scenario === "sync-off" ? "Sync is off" : "Storage access needed",
    );
    expect(capabilities.review).not.toHaveBeenCalled();
  },
);

it("keeps remote changes pending for review and ignores completion after the session is locked", async () => {
  const capabilities = galleryPopupSync("sync-review");
  capabilities.apply = vi.fn(capabilities.apply);
  let notify: Parameters<PopupSyncCapabilities["subscribe"]>[0] = () => {};
  capabilities.subscribe = (listener) => {
    notify = listener;
    return () => {};
  };
  render(
    <PopupSync
      vaultId="gallery-vault"
      capabilities={capabilities}
      onOpenOptions={() => {}}
    />,
  );
  await screen.findByText("Remote changes to review");
  expect(capabilities.apply).not.toHaveBeenCalled();
  let complete!: () => void;
  const result = await capabilities.review("gallery-vault");
  capabilities.review = vi.fn(
    () =>
      new Promise<Awaited<ReturnType<PopupSyncCapabilities["review"]>>>(
        (resolve) => {
          complete = () => resolve(result);
        },
      ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Sync now" }));
  await waitFor(() => expect(capabilities.review).toHaveBeenCalled());
  act(() => notify("session"));
  await act(async () => complete());
  expect(screen.queryByText("Remote changes to review")).toBeNull();
  expect(screen.queryByText("desktop")).toBeNull();
  expect(screen.getByText("Unlock the vault to check sync.")).toBeTruthy();
});

it.each(["upload", "apply", "pending"] as const)(
  "preserves the completed %s outcome when the follow-up status read fails",
  async (operation) => {
    const capabilities = galleryPopupSync(
      operation === "apply"
        ? "sync-review"
        : operation === "pending"
          ? "sync-pending"
          : "sync-upload",
    );
    const inspect = capabilities.inspect;
    let failRefresh = false;
    capabilities.inspect = vi.fn(async (vaultId) => {
      if (failRefresh) {
        failRefresh = false;
        throw new Error("Status unavailable");
      }
      return inspect(vaultId);
    });
    const action = operation === "apply" ? "apply" : "upload";
    if (action === "apply") {
      const apply = capabilities.apply;
      capabilities.apply = vi.fn(async (params) => {
        const receipt = await apply(params);
        failRefresh = true;
        return receipt;
      });
    } else {
      const upload = capabilities.upload;
      capabilities.upload = vi.fn(async (vaultId) => {
        const receipt = await upload(vaultId);
        failRefresh = true;
        return receipt;
      });
    }
    const { result } = renderHook(() =>
      usePopupSync("gallery-vault", capabilities),
    );
    await waitFor(() =>
      expect(result.current.status).toBe(
        operation === "apply" ? "review" : "upload",
      ),
    );
    if (operation === "apply") {
      act(() => result.current.choose("tag:tag-personal", "use_remote"));
    }
    await act(async () => {
      if (operation === "apply") await result.current.apply();
      else await result.current.check();
    });
    expect(result.current.status).toBe(
      operation === "pending" ? "pending" : "unchecked",
    );
    expect(result.current.error).toMatch(/status could not be refreshed/);
    expect(result.current.error).toMatch(
      operation === "pending"
        ? /Upload is still pending/
        : operation === "apply"
          ? /Changes applied and uploaded/
          : /Upload completed/,
    );
    expect(result.current.snapshot).toBeUndefined();
    if (operation !== "pending") {
      await act(async () => result.current.check());
      expect(capabilities[action]).toHaveBeenCalledTimes(1);
      expect(result.current.status).toBe("current");
    }
  },
);

it("invalidates a sync result when local data changes during its final inspection", async () => {
  const capabilities = galleryPopupSync();
  const inspect = capabilities.inspect;
  let notify: Parameters<PopupSyncCapabilities["subscribe"]>[0] = () => {};
  capabilities.subscribe = (listener) => {
    notify = listener;
    return () => {};
  };
  let reads = 0;
  capabilities.inspect = async (vaultId) => {
    const value = await inspect(vaultId);
    if (++reads === 2) notify("data");
    return value;
  };
  capabilities.review = vi.fn(capabilities.review);
  const { result } = renderHook(() =>
    usePopupSync("gallery-vault", capabilities),
  );
  await waitFor(() => expect(result.current.status).toBe("unchecked"));
  expect(result.current.snapshot).toBeUndefined();
  expect(result.current.review).toBeUndefined();
  expect(capabilities.review).toHaveBeenCalledTimes(1);
  await act(async () => result.current.check());
  expect(result.current.status).toBe("current");
});

it("clears a failed subscription's stale review and recovers on the next update", async () => {
  const capabilities = galleryPopupSync("sync-review");
  let notify: Parameters<PopupSyncCapabilities["subscribe"]>[0] = () => {};
  capabilities.subscribe = (listener) => {
    notify = listener;
    return () => {};
  };
  const { result } = renderHook(() =>
    usePopupSync("gallery-vault", capabilities),
  );
  await waitFor(() => expect(result.current.status).toBe("review"));
  act(() => result.current.choose("tag:tag-personal", "use_remote"));
  expect(result.current.review?.review).toBeTruthy();
  expect(result.current.snapshot).toBeDefined();
  expect(result.current.choices).toEqual({ "tag:tag-personal": "use_remote" });
  capabilities.inspect = vi
    .fn(capabilities.inspect)
    .mockRejectedValueOnce(new Error("Status unavailable"));
  await act(async () => notify("data"));
  expect(result.current.status).toBe("error");
  expect(result.current.error).toBeDefined();
  expect(result.current.snapshot).toBeUndefined();
  expect(result.current.review).toBeUndefined();
  expect(result.current.choices).toEqual({});
  await act(async () => notify("data"));
  expect(result.current.status).toBe("unchecked");
  expect(result.current.snapshot).toBeDefined();
  expect(result.current.error).toBeUndefined();
});

it("ignores an older subscription inspection that finishes after a newer one", async () => {
  const capabilities = galleryPopupSync();
  const current = await capabilities.inspect("gallery-vault");
  let notify: Parameters<PopupSyncCapabilities["subscribe"]>[0] = () => {};
  capabilities.subscribe = (listener) => {
    notify = listener;
    return () => {};
  };
  const { result } = renderHook(() =>
    usePopupSync("gallery-vault", capabilities),
  );
  await waitFor(() => expect(result.current.status).toBe("current"));

  let resolveOlder!: (value: typeof current) => void;
  let resolveNewer!: (value: typeof current) => void;
  capabilities.inspect = vi
    .fn<PopupSyncCapabilities["inspect"]>()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOlder = resolve;
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveNewer = resolve;
        }),
    );

  act(() => {
    notify("data");
    notify("data");
  });
  await act(async () => resolveNewer({ ...current, version: { current: 2 } }));
  expect(result.current.snapshot?.version).toEqual({ current: 2 });
  expect(result.current.status).toBe("unchecked");
  expect(result.current.error).toBeUndefined();

  await act(async () =>
    resolveOlder({
      ...current,
      version: { stale: 1 },
      configured: false,
      access: false,
    }),
  );
  expect(result.current.snapshot?.version).toEqual({ current: 2 });
  expect(result.current.status).toBe("unchecked");
  expect(result.current.error).toBeUndefined();
});
