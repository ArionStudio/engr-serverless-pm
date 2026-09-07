// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { gallerySync, syncLocation, syncReview } from "@/gallery/sync-fixture";
import type { SyncCapabilities } from "./sync.type";
import { useSync } from "./use-sync";
import { comparisons, resolutionFromChoices } from "./sync-review.mapper";
afterEach(cleanup);
const input = {
  ...syncLocation,
  accessKeyId: "EXAMPLE",
  secretAccessKey: "local-secret",
};
function mount(capabilities = gallerySync()) {
  let listener: Parameters<SyncCapabilities["subscribe"]>[0] = () => {};
  const unsubscribe = vi.fn();
  capabilities.subscribe = (callback) => {
    listener = callback;
    return unsubscribe;
  };
  return {
    ...renderHook(() => useSync("gallery-vault", capabilities)),
    capabilities,
    notify: (reason: "session" | "focus") => listener(reason),
    unsubscribe,
  };
}
async function ready(ctx: ReturnType<typeof mount>) {
  await waitFor(() => expect(ctx.result.current.target).not.toBeUndefined());
}
describe("sync UI lifecycle", () => {
  it("tests entered credentials without enabling sync and clears feedback on editing", async () => {
    const ctx = mount();
    await ready(ctx);
    ctx.capabilities.configure = vi.fn();
    ctx.capabilities.test = vi.fn();
    act(() => ctx.result.current.change(input));
    await act(() => ctx.result.current.test());
    expect(ctx.capabilities.test).toHaveBeenCalledWith("gallery-vault", input);
    expect(ctx.capabilities.configure).not.toHaveBeenCalled();
    expect(ctx.result.current.feedback?.state).toBe("access-confirmed");
    act(() => ctx.result.current.change({ ...input, region: "eu-west-1" }));
    expect(ctx.result.current.feedback).toBeUndefined();
  });
  it("enables sync and clears both keys after a confirmed upload", async () => {
    const ctx = mount();
    await ready(ctx);
    act(() => ctx.result.current.change(input));
    await act(() => ctx.result.current.save());
    expect(ctx.result.current.target).toEqual(syncLocation);
    expect(ctx.result.current.feedback?.state).toBe("complete");
    expect(ctx.result.current.draft.accessKeyId).toBe("");
    expect(ctx.result.current.draft.secretAccessKey).toBe("");
  });
  it("keeps uncertain uploads pending and supports an explicit retry", async () => {
    const ctx = mount(gallerySync("sync-pending"));
    await ready(ctx);
    await act(() => ctx.result.current.upload());
    expect(ctx.result.current.feedback?.state).toBe("pending");
    ctx.capabilities.upload = vi.fn(async () => ({
      syncUpload: "complete" as const,
    }));
    await act(() => ctx.result.current.upload());
    expect(ctx.result.current.feedback?.state).toBe("complete");
  });
  it("repairs keys for the existing target without claiming sync completion", async () => {
    const ctx = mount(gallerySync("sync-configured"));
    await ready(ctx);
    ctx.capabilities.repair = vi.fn();
    act(() => ctx.result.current.beginRepair());
    expect(ctx.result.current.draft).toMatchObject(syncLocation);
    act(() => ctx.result.current.change(input));
    await act(() => ctx.result.current.save());
    expect(ctx.capabilities.repair).toHaveBeenCalledWith(
      "gallery-vault",
      input,
    );
    expect(ctx.result.current.feedback?.state).toBe("not-checked");
    expect(ctx.result.current.repairing).toBe(false);
  });
  it("preserves an unfinished draft when returning from the AWS console", async () => {
    const ctx = mount();
    await ready(ctx);
    act(() => ctx.result.current.change(input));
    await act(async () => ctx.notify("focus"));
    expect(ctx.result.current.draft).toEqual(input);
  });
  it("clears secrets immediately on session change and ignores a late access result", async () => {
    const ctx = mount();
    await ready(ctx);
    let finish = () => {};
    ctx.capabilities.test = () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      });
    act(() => ctx.result.current.change(input));
    let pending: Promise<void>;
    act(() => {
      pending = ctx.result.current.test();
    });
    await act(async () => ctx.notify("session"));
    expect(ctx.result.current.draft.secretAccessKey).toBe("");
    await act(async () => {
      finish();
      await pending;
    });
    expect(ctx.result.current.feedback).toBeUndefined();
  });
  it("rejects duplicate submissions while the first request is running", async () => {
    const ctx = mount();
    await ready(ctx);
    let finish = () => {};
    ctx.capabilities.test = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    let pending: Promise<void>;
    act(() => {
      pending = ctx.result.current.test();
    });
    await act(() => ctx.result.current.test());
    expect(ctx.capabilities.test).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish();
      await pending;
    });
  });
  it("checks actual remote state and submits only explicit reviewed choices", async () => {
    const ctx = mount(gallerySync("sync-review"));
    await ready(ctx);
    ctx.capabilities.apply = vi.fn(async () => ({
      syncUpload: "complete" as const,
    }));
    await act(() => ctx.result.current.check());
    expect(ctx.result.current.choices).toEqual({});
    act(() => ctx.result.current.choose("tag:1", "use_remote"));
    await act(() => ctx.result.current.apply());
    expect(ctx.capabilities.apply).toHaveBeenCalledWith({
      vaultId: "gallery-vault",
      reviewedSnapshotIdentities: syncReview.reviewedSnapshotIdentities,
      resolution: {
        entryResolutions: [],
        tagResolutions: [{ tagId: 1, action: "use_remote" }],
        deviceProfileResolutions: [],
      },
    });
    expect(ctx.result.current.review).toBeUndefined();
  });
  it("discards stale review choices after a failed apply without exposing raw errors", async () => {
    const ctx = mount(gallerySync("sync-review"));
    await ready(ctx);
    ctx.capabilities.apply = async () => {
      throw new Error("AWS details with local-secret");
    };
    await act(() => ctx.result.current.check());
    act(() => ctx.result.current.choose("tag:1", "use_remote"));
    await act(() => ctx.result.current.apply());
    expect(ctx.result.current.error).not.toContain("local-secret");
    expect(ctx.result.current.review).toBeUndefined();
    expect(ctx.result.current.choices).toEqual({});
  });
  it("ignores a focus inspection that finishes after configuration is saved", async () => {
    const ctx = mount();
    await ready(ctx);
    let finishSave = () => {};
    let finishInspection = () => {};
    ctx.capabilities.configure = () =>
      new Promise((resolve) => {
        finishSave = () => resolve({ syncUpload: "complete" });
      });
    ctx.capabilities.inspect = vi
      .fn<SyncCapabilities["inspect"]>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishInspection = () => resolve(null);
          }),
      )
      .mockResolvedValue(syncLocation);
    let pending: Promise<void>;
    act(() => {
      pending = ctx.result.current.save();
    });
    act(() => ctx.notify("focus"));
    await act(async () => {
      finishSave();
      await pending;
    });
    expect(ctx.result.current.target).toEqual(syncLocation);
    await act(async () => finishInspection());
    expect(ctx.result.current.target).toEqual(syncLocation);
  });
  it("does not send incomplete choices to core", () => {
    expect(comparisons(syncReview)[0].id).toBe("tag:1");
    expect(() => resolutionFromChoices(syncReview, {})).toThrow(
      "Incomplete review",
    );
  });
});
