// @vitest-environment jsdom
import { UnlockedVaultSessionExpiredError } from "@lfspm/core";
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
    notify: (...event: Parameters<typeof listener>) => listener(...event),
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
  it("preserves a repair draft when the browser permission lookup fails on focus", async () => {
    const ctx = mount(gallerySync("sync-configured"));
    await ready(ctx);
    act(() => ctx.result.current.beginRepair());
    act(() => ctx.result.current.change(input));
    ctx.capabilities.test = async () => {
      throw new Error("Upload unavailable");
    };
    await act(() => ctx.result.current.test());
    const operationError = ctx.result.current.error;
    expect(operationError).toBeTruthy();
    ctx.capabilities.hasAccess = vi
      .fn()
      .mockRejectedValue(new Error("Browser API unavailable"));
    await act(async () => ctx.notify("focus"));
    expect(ctx.result.current.draft).toEqual(input);
    expect(ctx.result.current.repairing).toBe(true);
    expect(ctx.result.current.target).toEqual(syncLocation);
    expect(ctx.result.current.accessMissing).toBe(true);
    expect(ctx.result.current.error).toBe(operationError);
    ctx.capabilities.hasAccess = async () => true;
    await act(async () => ctx.notify("focus"));
    expect(ctx.result.current.error).toBe(operationError);
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
  it("asks to unlock again when a repair session expires", async () => {
    const ctx = mount(gallerySync("sync-configured"));
    await ready(ctx);
    ctx.capabilities.repair = vi
      .fn()
      .mockRejectedValue(new UnlockedVaultSessionExpiredError("gallery-vault"));
    act(() => ctx.result.current.beginRepair());
    act(() => ctx.result.current.change(input));
    await act(() => ctx.result.current.save());
    expect(ctx.result.current.error).toBe(
      "Unlock this vault again before continuing.",
    );
    expect(ctx.result.current.feedback).toBeUndefined();
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
    await act(async () => ctx.notify("focus"));
    await act(async () => {
      finishSave();
      await pending;
    });
    expect(ctx.result.current.target).toEqual(syncLocation);
    await act(async () => finishInspection());
    expect(ctx.result.current.target).toEqual(syncLocation);
  });
  it("clears an access confirmation when permission changes before setup is saved", async () => {
    const ctx = mount();
    await ready(ctx);
    act(() => ctx.result.current.change(input));
    await act(() => ctx.result.current.test());
    expect(ctx.result.current.feedback?.state).toBe("access-confirmed");
    await act(async () => ctx.notify("permissions"));
    expect(ctx.result.current.feedback).toBeUndefined();
    expect(ctx.result.current.draft).toEqual(input);
  });
  it("keeps entered keys on denied permission and sends no operation", async () => {
    const ctx = mount();
    await ready(ctx);
    ctx.capabilities.requestAccess = async () => {
      const e = new Error();
      e.name = "StorageHostPermissionRequiredError";
      throw e;
    };
    ctx.capabilities.test = vi.fn();
    act(() => ctx.result.current.change(input));
    await act(() => ctx.result.current.test());
    expect(ctx.capabilities.test).not.toHaveBeenCalled();
    expect(ctx.result.current.draft).toEqual(input);
    expect(ctx.result.current.error).toContain("Storage access is not allowed");
  });
  it("discards review after permission revocation and permits recovery without losing configuration", async () => {
    const ctx = mount(gallerySync("sync-review"));
    await ready(ctx);
    await act(() => ctx.result.current.check());
    const review = ctx.result.current.review;
    const unaffected = vi.fn(() => false);
    await act(async () => ctx.notify("permissions-removed", unaffected));
    await act(async () => ctx.notify("permissions", unaffected));
    expect(unaffected).toHaveBeenCalledWith(syncLocation);
    expect(ctx.result.current.review).toBe(review);
    ctx.capabilities.hasAccess = async () => false;
    await act(async () => ctx.notify("permissions-removed"));
    expect(ctx.result.current.accessMissing).toBe(true);
    expect(ctx.result.current.target).toEqual(syncLocation);
    expect(ctx.result.current.review).toBeUndefined();
    expect(ctx.result.current.feedback).toBeUndefined();
    ctx.capabilities.hasAccess = async () => true;
    await act(() => ctx.result.current.allowAccess());
    expect(ctx.result.current.accessMissing).toBe(false);
  });
  it.each(["check", "upload"] as const)(
    "ignores a late %s result after permission removal and allows a new grant",
    async (operation) => {
      const ctx = mount(gallerySync("sync-review"));
      await ready(ctx);
      let finish = () => {};
      if (operation === "check")
        ctx.capabilities.review = () =>
          new Promise((resolve) => {
            finish = () => resolve(syncReview);
          });
      else
        ctx.capabilities.upload = () =>
          new Promise((resolve) => {
            finish = () => resolve({ syncUpload: "complete" });
          });
      let pending: Promise<void>;
      act(() => {
        pending = ctx.result.current[operation]();
      });
      await waitFor(() =>
        expect(ctx.result.current.operation).toBe(
          operation === "check" ? "review" : "upload",
        ),
      );
      await act(async () => {});
      const unrelated = vi.fn(() => false);
      await act(async () => ctx.notify("permissions-removed", unrelated));
      expect(unrelated).toHaveBeenCalledWith(syncLocation);
      expect(ctx.result.current.operation).toBe(
        operation === "check" ? "review" : "upload",
      );
      ctx.capabilities.hasAccess = async () => false;
      await act(async () => ctx.notify("permissions-removed"));
      expect(ctx.result.current.accessMissing).toBe(true);
      expect(ctx.result.current.operation).toBe(
        operation === "check" ? "review" : "upload",
      );
      await act(async () => {
        finish();
        await pending;
      });
      expect(ctx.result.current.operation).toBeUndefined();
      expect(ctx.result.current.review).toBeUndefined();
      expect(ctx.result.current.feedback).toBeUndefined();
      ctx.capabilities.requestAccess = async () => {
        ctx.capabilities.hasAccess = async () => true;
        ctx.notify("permissions");
      };
      ctx.capabilities.review = async () => syncReview;
      await act(() => ctx.result.current.check());
      expect(ctx.result.current.review).toEqual(syncReview);
      expect(ctx.result.current.accessMissing).toBe(false);
    },
  );
  it("does not start an operation if the vault locks while permission is pending", async () => {
    const ctx = mount();
    await ready(ctx);
    let grant = () => {};
    ctx.capabilities.requestAccess = () =>
      new Promise<void>((resolve) => {
        grant = resolve;
      });
    ctx.capabilities.configure = vi.fn();
    act(() => ctx.result.current.change(input));
    let pending: Promise<void>;
    act(() => {
      pending = ctx.result.current.save();
    });
    await act(async () => ctx.notify("session"));
    await act(async () => {
      grant();
      await pending;
    });
    expect(ctx.capabilities.configure).not.toHaveBeenCalled();
    expect(ctx.result.current.draft.secretAccessKey).toBe("");
  });
  it("does not send incomplete choices to core", () => {
    expect(comparisons(syncReview)[0].id).toBe("tag:1");
    expect(() => resolutionFromChoices(syncReview, {})).toThrow(
      "Incomplete review",
    );
  });
});

it.each(["complete", "pending", "repair"] as const)(
  "preserves the %s save outcome when configuration refresh fails and can retry the read",
  async (outcome) => {
    const ctx = mount(
      gallerySync(outcome === "repair" ? "sync-configured" : "sync-setup"),
    );
    await ready(ctx);
    if (outcome === "repair") act(() => ctx.result.current.beginRepair());
    act(() => ctx.result.current.change(input));
    ctx.capabilities.configure = vi.fn<SyncCapabilities["configure"]>(
      async () => ({
        syncUpload: outcome === "pending" ? "pending" : "complete",
      }),
    );
    ctx.capabilities.repair = vi.fn(async () => {});
    ctx.capabilities.inspect = vi
      .fn()
      .mockRejectedValueOnce(new Error("private provider detail"))
      .mockRejectedValueOnce(new Error("private provider detail"))
      .mockResolvedValue(syncLocation);
    await act(() => ctx.result.current.save());
    const expected = outcome === "repair" ? "not-checked" : outcome;
    expect(ctx.result.current.feedback?.state).toBe(expected);
    expect(ctx.result.current.error).toBe(
      "Could not load the sync configuration. Choose Try again to reload it.",
    );
    expect(ctx.result.current.target).toBeUndefined();
    expect(ctx.result.current.draft.secretAccessKey).toBe("");
    await act(() => ctx.result.current.refresh());
    expect(ctx.result.current.feedback?.state).toBe(expected);
    await act(() => ctx.result.current.refresh());
    expect(ctx.result.current.error).toBeUndefined();
    expect(ctx.result.current.target).toEqual(syncLocation);
    expect(ctx.result.current.feedback?.state).toBe(expected);
    expect(
      outcome === "repair"
        ? ctx.capabilities.repair
        : ctx.capabilities.configure,
    ).toHaveBeenCalledTimes(1);
  },
);

it.each(["test", "repair"] as const)(
  "keeps replacement keys available after a failed %s until session ownership changes",
  async (operation) => {
    const ctx = mount(gallerySync("sync-configured"));
    await ready(ctx);
    act(() => ctx.result.current.beginRepair());
    act(() => ctx.result.current.change(input));
    ctx.capabilities[operation] = vi.fn(async () => {
      throw new Error("network unavailable");
    });
    await act(() =>
      operation === "test"
        ? ctx.result.current.test()
        : ctx.result.current.save(),
    );
    expect(ctx.result.current.repairing).toBe(true);
    expect(ctx.result.current.draft).toEqual(input);
    expect(ctx.result.current.error).toBeTruthy();
    await act(async () => ctx.notify("session"));
    expect(ctx.result.current.draft.secretAccessKey).toBe("");
    expect(ctx.result.current.repairing).toBe(false);
  },
);

it("clears obsolete inspection errors when a new session loads successfully", async () => {
  const capabilities = gallerySync("sync-configured");
  capabilities.inspect = vi
    .fn()
    .mockRejectedValueOnce(new Error("session unavailable"))
    .mockResolvedValue(syncLocation);
  const ctx = mount(capabilities);
  await waitFor(() => expect(ctx.result.current.error).toBeTruthy());
  await act(async () => ctx.notify("session"));
  expect(ctx.result.current.target).toEqual(syncLocation);
  expect(ctx.result.current.error).toBeUndefined();
});

it.each(["save", "reconcile"] as const)(
  "keeps the authorized saved target when permission lookup fails during %s",
  async (mode) => {
    const ctx = mount();
    await ready(ctx);
    act(() => ctx.result.current.change(input));
    ctx.capabilities.configure = async () => {
      ctx.capabilities.inspect = async () => syncLocation;
      if (mode === "reconcile") throw new Error("Upload response lost");
      return { syncUpload: "complete" };
    };
    ctx.capabilities.hasAccess = async () => {
      throw new Error("Browser API unavailable");
    };
    await act(() => ctx.result.current.save());
    expect(ctx.result.current.target).toEqual(syncLocation);
    expect(ctx.result.current.accessMissing).toBe(true);
    expect(ctx.result.current.draft.secretAccessKey).toBe("");
    const expectedError =
      mode === "save"
        ? "Could not check this browser's S3 access. Allow storage access and try again."
        : "Could not reach or authenticate with S3. Check your connection, region, key permissions and browser storage access, then try again.";
    expect(ctx.result.current.error).toBe(expectedError);
    ctx.capabilities.hasAccess = async () => true;
    await act(async () => ctx.notify("permissions"));
    expect(ctx.result.current.accessMissing).toBe(false);
    expect(ctx.result.current.error).toBe(
      mode === "save" ? undefined : expectedError,
    );
  },
);

it.each(["surviving", "replaced", "read-failed"] as const)(
  "reconciles revoked setup in a %s session",
  async (session) => {
    const ctx = mount();
    await ready(ctx);
    act(() => ctx.result.current.change(input));
    let finish = () => {};
    ctx.capabilities.configure = vi.fn<SyncCapabilities["configure"]>(
      () =>
        new Promise((resolve) => {
          finish = () => {
            ctx.capabilities.inspect = vi.fn(async () => {
              if (session === "read-failed")
                throw new Error("Session unavailable");
              return syncLocation;
            });
            resolve({ syncUpload: "complete" });
          };
        }),
    );
    let pending: Promise<void>;
    act(() => {
      pending = ctx.result.current.save();
    });
    await waitFor(() => expect(ctx.capabilities.configure).toHaveBeenCalled());
    ctx.capabilities.hasAccess = async () => false;
    await act(async () => ctx.notify("permissions-removed"));
    expect(ctx.result.current.target).toBeNull();
    if (session === "replaced") {
      await act(async () => ctx.notify("session"));
      act(() =>
        ctx.result.current.change({
          ...input,
          secretAccessKey: "new-session-draft",
        }),
      );
    }
    ctx.capabilities.test = vi.fn();
    if (session !== "replaced") {
      ctx.capabilities.hasAccess = async () => true;
      await act(async () => ctx.notify("permissions"));
      await act(() => ctx.result.current.test());
      expect(ctx.capabilities.test).not.toHaveBeenCalled();
      expect(ctx.result.current.operation).toBe("configure");
      ctx.capabilities.hasAccess = async () => false;
    }
    await act(async () => {
      finish();
      await pending;
    });
    expect(ctx.result.current.feedback).toBeUndefined();
    expect(ctx.result.current.operation).toBeUndefined();
    if (session === "replaced") {
      expect(ctx.capabilities.inspect).not.toHaveBeenCalled();
      expect(ctx.result.current.draft.secretAccessKey).toBe(
        "new-session-draft",
      );
    } else {
      if (session === "read-failed") {
        expect(ctx.result.current.target).toBeUndefined();
        expect(ctx.result.current.error).toContain(
          "Could not load the sync configuration",
        );
      } else {
        expect(ctx.result.current.target).toEqual(syncLocation);
        expect(ctx.result.current.accessMissing).toBe(true);
      }
      expect(ctx.result.current.draft.secretAccessKey).toBe("");
    }
  },
);

it.each(
  (["focus", "permissions-removed", "session"] as const).flatMap((event) =>
    (["saved", "read-failed"] as const).map((outcome) => ({ event, outcome })),
  ),
)(
  "keeps setup cleanup session-owned when $event interrupts $outcome reconciliation",
  async ({ event, outcome }) => {
    const ctx = mount();
    await ready(ctx);
    act(() => ctx.result.current.change(input));
    let finishConfigure = () => {};
    ctx.capabilities.configure = vi.fn(
      () =>
        new Promise<{ syncUpload: "complete" }>((resolve) => {
          finishConfigure = () => resolve({ syncUpload: "complete" });
        }),
    );
    let pending: Promise<void>;
    act(() => {
      pending = ctx.result.current.save();
    });
    await waitFor(() => expect(ctx.capabilities.configure).toHaveBeenCalled());
    await act(async () => ctx.notify("permissions-removed"));
    let finishInspection = () => {};
    ctx.capabilities.inspect = vi
      .fn<SyncCapabilities["inspect"]>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            finishInspection = () =>
              outcome === "read-failed"
                ? reject(new Error("Session unavailable"))
                : resolve(syncLocation);
          }),
      )
      .mockResolvedValue(syncLocation);
    await act(async () => finishConfigure());
    await waitFor(() =>
      expect(ctx.capabilities.inspect).toHaveBeenCalledTimes(1),
    );
    await act(async () => ctx.notify(event));
    if (event === "session")
      act(() =>
        ctx.result.current.change({
          ...input,
          secretAccessKey: "new-session-draft",
        }),
      );
    await act(async () => {
      finishInspection();
      await pending;
    });
    expect(ctx.result.current.target).toEqual(syncLocation);
    expect(ctx.result.current.draft.accessKeyId).toBe(
      event === "session" ? input.accessKeyId : "",
    );
    expect(ctx.result.current.draft.secretAccessKey).toBe(
      event === "session" ? "new-session-draft" : "",
    );
  },
);
