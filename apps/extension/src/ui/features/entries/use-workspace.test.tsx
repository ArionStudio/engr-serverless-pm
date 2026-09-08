import { emptyEntryDraft } from "./entry-draft";
// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { galleryWorkspace } from "@/gallery/workspace-fixture";
import { useWorkspace } from "./use-workspace";
import type { WorkspaceCapabilities } from "./workspace.type";
import type { ReadEntryForEditingResult } from "@lfspm/core";
afterEach(cleanup);
function fixture() {
  const capabilities = galleryWorkspace();
  let signal: Parameters<WorkspaceCapabilities["subscribe"]>[0] = () => {};
  capabilities.subscribe = (listener) => {
    signal = listener;
    return () => {};
  };
  return {
    capabilities,
    signal: (reason: "session" | "focus" | "data") => signal(reason),
  };
}
describe("workspace lifecycle and writes", () => {
  it("lets Lock interrupt a read but ignores repeated Lock until its attempt settles", async () => {
    const { capabilities } = fixture();
    const read = vi.fn(capabilities.read);
    capabilities.read = read;
    const record = await capabilities.edit("vault", "entry-review");
    let finishRead!: (value: ReadEntryForEditingResult) => void;
    capabilities.edit = () =>
      new Promise((resolve) => {
        finishRead = resolve;
      });
    let finishLock!: () => void;
    const lockAttempt = new Promise<void>((resolve) => {
      finishLock = resolve;
    });
    const lock = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => lockAttempt)
      .mockResolvedValue(undefined);
    const { result } = renderHook(() => useWorkspace("vault", capabilities));
    await waitFor(() => expect(result.current.data).toBeDefined());
    act(() => result.current.edit("entry-review"));
    await act(async () => {
      result.current.lock(lock);
      result.current.lock(lock);
    });
    expect(lock).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledTimes(1);
    expect(result.current.data).toBeUndefined();
    await act(async () => finishRead(record));
    expect(result.current.view.kind).toBe("list");
    await act(async () => finishLock());
    expect(read).toHaveBeenCalledTimes(2);
    expect(result.current.data).toBeDefined();
    expect(result.current.view.kind).toBe("list");
  });
  it("clears a closing page without reading again and refreshes on cached-page restoration", async () => {
    const { capabilities } = fixture();
    const read = vi.fn(capabilities.read);
    capabilities.read = read;
    const invalidate = vi.fn();
    const { result } = renderHook(() =>
      useWorkspace("vault", capabilities, undefined, invalidate),
    );
    await waitFor(() => expect(result.current.data).toBeDefined());
    act(() => result.current.edit("entry-review"));
    await waitFor(() => expect(result.current.view.kind).toBe("editor"));
    await act(async () =>
      window.dispatchEvent(
        new PageTransitionEvent("pagehide", { persisted: true }),
      ),
    );
    expect(read).toHaveBeenCalledTimes(1);
    expect(result.current.data).toBeUndefined();
    expect(result.current.view.kind).toBe("list");
    expect(result.current.password).toBeUndefined();
    expect(invalidate).toHaveBeenCalledOnce();
    await act(async () =>
      window.dispatchEvent(
        new PageTransitionEvent("pageshow", { persisted: true }),
      ),
    );
    expect(read).toHaveBeenCalledTimes(2);
    expect(result.current.data).toBeDefined();
    expect(result.current.view.kind).toBe("list");
  });
  it("drops a late active-page lookup when the session changes", async () => {
    const { capabilities, signal } = fixture();
    let resolve!: (url: string) => void;
    capabilities.readActivePageUrl = () =>
      new Promise((done) => {
        resolve = done;
      });
    const { result } = renderHook(() =>
      useWorkspace("vault", capabilities, {
        ...emptyEntryDraft,
        password: "Generated-password-9!",
      }),
    );
    await waitFor(() => expect(result.current.data).toBeDefined());
    act(() => signal("session"));
    await act(async () => resolve("https://example.com/sign-in"));
    expect(result.current.view.kind).toBe("list");
  });
  it("opens the draft when active-tab URL lookup fails without treating it as session loss", async () => {
    const { capabilities } = fixture();
    capabilities.readActivePageUrl = () => {
      throw new Error("Tabs permission unavailable");
    };
    const sessionLost = vi.fn();
    const { result } = renderHook(() =>
      useWorkspace(
        "vault",
        capabilities,
        {
          ...emptyEntryDraft,
          password: "Generated-password-9!",
        },
        undefined,
        sessionLost,
      ),
    );
    await waitFor(() => {
      expect(result.current.view.kind).toBe("editor");
      expect(result.current.data).toBeDefined();
    });
    expect(result.current.error).toBeUndefined();
    expect(sessionLost).not.toHaveBeenCalled();
  });
  it("keeps a detected URL instead of replacing it with the current tab", async () => {
    const capabilities = galleryWorkspace();
    const active = vi.fn(async () => "https://different.example.test");
    capabilities.readActivePageUrl = active;
    const { result } = renderHook(() => useWorkspace("vault", capabilities));
    await waitFor(() => expect(result.current.data).toBeDefined());
    act(() =>
      result.current.edit(undefined, {
        login: "alex",
        password: "captured",
        url: "https://captured.example.test/sign-in",
      }),
    );
    await waitFor(() => expect(result.current.view.kind).toBe("editor"));
    expect(active).not.toHaveBeenCalled();
    if (result.current.view.kind === "editor")
      expect(result.current.view.initial.url).toBe(
        "https://captured.example.test/sign-in",
      );
  });

  it.each(["tag", "folder"] as const)(
    "keeps the entry draft open and reports an inline %s pending upload",
    async (kind) => {
      const capabilities = galleryWorkspace("workspace-pending-upload");
      const { result } = renderHook(() => useWorkspace("vault", capabilities));
      await waitFor(() => expect(result.current.data).toBeDefined());
      act(() => result.current.edit());
      await waitFor(() => expect(result.current.view.kind).toBe("editor"));
      const editor = result.current.view;
      await act(async () => {
        if (kind === "tag")
          await result.current.createTag({
            name: "Finance",
            groupId: "other",
            color: "gray",
            shade: 500,
          });
        else
          await result.current.createFolder({
            name: "Finance",
            icon: "banknote",
            parentId: null,
          });
      });
      expect(result.current.view).toEqual(editor);
      expect(result.current.uploadPending).toBe(true);
      expect(result.current.feedback).toContain(
        `${kind === "tag" ? "Tag" : "Folder"} saved on this device`,
      );
      expect(result.current.feedback).toContain(
        "Upload has not been confirmed",
      );
    },
  );
  it.each(["tag", "folder"] as const)(
    "uses the inline %s receipt when the workspace reload fails",
    async (kind) => {
      const capabilities = galleryWorkspace();
      const read = capabilities.read;
      const createTag = capabilities.createTag;
      const createFolder = capabilities.createFolder;
      capabilities.createTag = async (params) => {
        const result = await createTag(params);
        capabilities.read = vi
          .fn()
          .mockRejectedValueOnce(new Error("Local read failed"))
          .mockImplementation(read);
        return { ...result, syncUpload: "complete", syncConfigured: true };
      };
      capabilities.createFolder = async (params) => {
        const result = await createFolder(params);
        capabilities.read = vi
          .fn()
          .mockRejectedValueOnce(new Error("Local read failed"))
          .mockImplementation(read);
        return { ...result, syncUpload: "complete", syncConfigured: true };
      };
      const { result } = renderHook(() => useWorkspace("vault", capabilities));
      await waitFor(() => expect(result.current.data).toBeDefined());
      act(() => result.current.edit());
      await waitFor(() => expect(result.current.view.kind).toBe("editor"));
      const editor = result.current.view;
      await act(async () => {
        if (kind === "tag")
          await result.current.createTag({
            name: "Finance",
            groupId: "other",
            color: "gray",
            shade: 500,
          });
        else
          await result.current.createFolder({
            name: "Finance",
            icon: "banknote",
            parentId: null,
          });
      });
      expect(result.current.feedback).toBe(
        `${kind === "tag" ? "Tag" : "Folder"} saved and uploaded.`,
      );
      expect(result.current.error).toBeUndefined();
      const items =
        kind === "tag"
          ? result.current.data?.tags
          : result.current.data?.folders;
      expect(items?.some((item) => item.name === "Finance")).toBe(true);
      expect(result.current.view).toBe(editor);
    },
  );
  it("drops a late editor read when the vault session changes", async () => {
    const { capabilities, signal } = fixture();
    let resolve!: (value: ReadEntryForEditingResult) => void;
    const record = await capabilities.edit("vault", "entry-review");
    capabilities.edit = () =>
      new Promise((done) => {
        resolve = done;
      });
    const { result } = renderHook(() => useWorkspace("vault", capabilities));
    await waitFor(() => expect(result.current.data).toBeDefined());
    act(() => result.current.edit("entry-review"));
    act(() => signal("session"));
    await act(async () => resolve(record));
    expect(result.current.view.kind).toBe("list");
    expect(result.current.password).toBeUndefined();
  });
  it("keeps the reviewed version through refresh and blocks duplicate writes", async () => {
    const { capabilities, signal } = fixture();
    let reject!: (cause: Error) => void;
    const update = vi.fn<WorkspaceCapabilities["update"]>(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    capabilities.update = update;
    const { result } = renderHook(() => useWorkspace("vault", capabilities));
    await waitFor(() => expect(result.current.data).toBeDefined());
    act(() => result.current.edit("entry-review"));
    await waitFor(() => expect(result.current.view.kind).toBe("editor"));
    act(() => signal("focus"));
    const view = result.current.view;
    if (view.kind !== "editor") throw new Error("Expected editor");
    act(() => {
      result.current.save(view.initial);
      result.current.save(view.initial);
    });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].expectedEntryVersionVector).toEqual({
      gallery: 1,
    });
    const error = new Error("Changed");
    error.name = "PasswordEntryChangedError";
    await act(async () => reject(error));
    expect(result.current.view).toEqual(view);
    expect(result.current.stale).toBe(true);
    await act(async () => signal("focus"));
    expect(result.current.error).toContain("changed");
    expect(result.current.view).toEqual(view);
  });
  it("hides a revealed password on blur and never restores a late reveal", async () => {
    const { capabilities } = fixture();
    const { result } = renderHook(() => useWorkspace("vault", capabilities));
    await waitFor(() => expect(result.current.data).toBeDefined());
    act(() => result.current.open("entry-review"));
    await waitFor(() => expect(result.current.view.kind).toBe("details"));
    const record = await capabilities.edit("vault", "entry-review");
    let resolve!: (value: ReadEntryForEditingResult) => void;
    capabilities.edit = () =>
      new Promise((done) => {
        resolve = done;
      });
    act(() => result.current.reveal());
    act(() => window.dispatchEvent(new Event("blur")));
    await act(async () => resolve(record));
    expect(result.current.password).toBeUndefined();
  });
  it("keeps the details version when confirming deletion", async () => {
    const { capabilities } = fixture();
    const details = vi.fn(capabilities.details);
    capabilities.details = details;
    const changed = new Error("Changed");
    changed.name = "PasswordEntryChangedError";
    const remove = vi
      .fn<WorkspaceCapabilities["remove"]>()
      .mockRejectedValue(changed);
    capabilities.remove = remove;
    const { result } = renderHook(() => useWorkspace("vault", capabilities));
    await waitFor(() => expect(result.current.data).toBeDefined());
    act(() => result.current.open("entry-review"));
    await waitFor(() => expect(result.current.view.kind).toBe("details"));
    const record = await details("vault", "entry-review");
    details.mockResolvedValue({
      ...record,
      entryVersionVector: { gallery: 2 },
    });
    details.mockClear();
    act(() => result.current.open("entry-review", "delete"));
    await waitFor(() => expect(result.current.view.kind).toBe("delete"));
    expect(details).not.toHaveBeenCalled();
    act(() => result.current.remove());
    await waitFor(() => expect(result.current.stale).toBe(true));
    expect(remove.mock.calls[0][0].expectedEntryVersionVector).toEqual({
      gallery: 1,
    });
    expect(result.current.feedback).toBeUndefined();
    expect(result.current.error).toContain("Cancel deletion");
  });
  it("drops an editor read after blur but preserves an already-open draft", async () => {
    const { capabilities } = fixture();
    const edit = capabilities.edit;
    const record = await edit("vault", "entry-review");
    let resolve!: (value: ReadEntryForEditingResult) => void;
    capabilities.edit = () =>
      new Promise((done) => {
        resolve = done;
      });
    const { result } = renderHook(() => useWorkspace("vault", capabilities));
    await waitFor(() => expect(result.current.data).toBeDefined());
    act(() => result.current.edit("entry-review"));
    act(() => window.dispatchEvent(new Event("blur")));
    await act(async () => resolve(record));
    expect(result.current.view.kind).toBe("list");
    capabilities.edit = edit;
    act(() => result.current.edit("entry-review"));
    await waitFor(() => expect(result.current.view.kind).toBe("editor"));
    const draft = result.current.view;
    act(() => window.dispatchEvent(new Event("blur")));
    expect(result.current.view).toEqual(draft);
  });
  it("clears a list action error after a successful reload", async () => {
    const { capabilities } = fixture();
    const missing = new Error("Deleted in another context");
    missing.name = "PasswordEntryNotFoundError";
    capabilities.details = vi.fn().mockRejectedValue(missing);
    const { result } = renderHook(() => useWorkspace("vault", capabilities));
    await waitFor(() => expect(result.current.data).toBeDefined());
    act(() => result.current.open("entry-review"));
    await waitFor(() => expect(result.current.error).toContain("deleted"));
    await act(async () => result.current.refresh());
    expect(result.current.error).toBeUndefined();
  });
  it.each([
    "VaultMustBeUnlockedError",
    "UnlockedVaultSessionExpiredError",
    "UnlockedVaultSessionInvalidError",
  ])("discards an editor when core rejects it with %s", async (errorName) => {
    const { capabilities } = fixture();
    const expired = new Error("Session expired");
    expired.name = errorName;
    capabilities.update = vi.fn().mockRejectedValue(expired);
    const { result } = renderHook(() => useWorkspace("vault", capabilities));
    await waitFor(() => expect(result.current.data).toBeDefined());
    act(() => result.current.edit("entry-review"));
    await waitFor(() => expect(result.current.view.kind).toBe("editor"));
    const view = result.current.view;
    if (view.kind !== "editor") throw new Error("Expected editor");
    act(() => result.current.save(view.initial));
    await waitFor(() => expect(result.current.view.kind).toBe("list"));
    expect(result.current.data).toBeUndefined();
    expect(result.current.pending).toBe(false);
    if (errorName === "UnlockedVaultSessionInvalidError")
      expect(result.current.error).toContain("Reload the extension page");
  });
  it.each([true, false])(
    "retains a failed save draft only with current session access: %s",
    async (authorized) => {
      const { capabilities } = fixture();
      capabilities.update = vi.fn(async () => {
        if (!authorized)
          capabilities.read = vi
            .fn()
            .mockRejectedValue(new Error("Session cleanup failed"));
        throw new Error("Storage write failed");
      });
      const { result } = renderHook(() => useWorkspace("vault", capabilities));
      await waitFor(() => expect(result.current.data).toBeDefined());
      act(() => result.current.edit("entry-review"));
      await waitFor(() => expect(result.current.view.kind).toBe("editor"));
      const view = result.current.view;
      if (view.kind !== "editor") throw new Error("Expected editor");
      act(() => result.current.save(view.initial));
      await waitFor(() => expect(result.current.pending).toBe(false));
      expect(result.current.error).toBeDefined();
      expect(result.current.view).toEqual(authorized ? view : { kind: "list" });
      expect(result.current.data !== undefined).toBe(authorized);
      expect(capabilities.update).toHaveBeenCalledOnce();
    },
  );
  it.each(["details", "edit", "reveal"] as const)(
    "reconciles cached material before a %s read",
    async (action) => {
      const { capabilities } = fixture();
      const details = vi.fn(capabilities.details);
      const edit = vi.fn(capabilities.edit);
      capabilities.details = details;
      capabilities.edit = edit;
      const { result } = renderHook(() => useWorkspace("vault", capabilities));
      await waitFor(() => expect(result.current.data).toBeDefined());
      if (action === "reveal") {
        act(() => result.current.open("entry-review"));
        await waitFor(() => expect(result.current.view.kind).toBe("details"));
      }
      const cacheMiss = new Error("Cached material was evicted");
      cacheMiss.name = "VaultMustBeUnlockedError";
      if (action === "details") details.mockRejectedValueOnce(cacheMiss);
      else edit.mockRejectedValueOnce(cacheMiss);
      act(() => {
        if (action === "details") result.current.open("entry-review");
        else if (action === "edit") result.current.edit("entry-review");
        else result.current.reveal();
      });
      await waitFor(() => expect(result.current.pending).toBe(false));
      expect(result.current.error).toBeUndefined();
      expect(result.current.view.kind).toBe(
        action === "edit" ? "editor" : "details",
      );
      expect(action === "details" ? details : edit).toHaveBeenCalledTimes(2);
      if (action === "reveal")
        expect(result.current.password).toBe("Gallery-River-8!Pine-Sky");
      capabilities.read = vi
        .fn()
        .mockRejectedValue(new Error("Session revoked"));
      if (action === "details")
        details.mockRejectedValue(new Error("Storage read failed"));
      else edit.mockRejectedValue(new Error("Storage read failed"));
      act(() => {
        if (action === "details") result.current.open("entry-review");
        else if (action === "edit") result.current.edit("entry-review");
        else result.current.reveal();
      });
      await waitFor(() => expect(result.current.pending).toBe(false));
      expect(result.current.view.kind).toBe("list");
      expect(result.current.data).toBeUndefined();
      expect(result.current.password).toBeUndefined();
      expect(result.current.error).toBeDefined();
    },
  );
  it.each(["data", "focus", "session"] as const)(
    "reconciles a %s notification and only retains same-session drafts",
    async (reason) => {
      const { capabilities, signal } = fixture();
      const read = vi.fn(capabilities.read);
      capabilities.read = read;
      const invalidated = vi.fn();
      const { result } = renderHook(() =>
        useWorkspace("vault", capabilities, undefined, invalidated),
      );
      await waitFor(() => expect(result.current.data).toBeDefined());
      act(() => result.current.edit("entry-review"));
      await waitFor(() => expect(result.current.view.kind).toBe("editor"));
      const draft = result.current.view;
      const cacheMiss = new Error("Cached session material was evicted");
      cacheMiss.name = "VaultMustBeUnlockedError";
      read.mockRejectedValueOnce(cacheMiss);
      await act(async () => signal(reason));
      expect(read).toHaveBeenCalledTimes(3);
      expect(result.current.view).toEqual(
        reason === "session" ? { kind: "list" } : draft,
      );
      expect(result.current.data).toBeDefined();
      expect(result.current.error).toBeUndefined();
      expect(invalidated).toHaveBeenCalledTimes(reason === "session" ? 1 : 0);
      read.mockRejectedValue(cacheMiss);
      await act(async () => signal("data"));
      expect(result.current.view.kind).toBe("list");
      expect(invalidated).toHaveBeenCalledTimes(reason === "session" ? 2 : 1);
    },
  );
  it.each(["local", "complete", "pending"])(
    "uses the %s mutation outcome despite an earlier sync setting and failed reloads",
    async (outcome) => {
      const { capabilities, signal } = fixture();
      const read = capabilities.read;
      capabilities.read = async (id) => ({
        ...(await read(id)),
        syncConfigured: outcome === "local",
      });
      const add = capabilities.add;
      capabilities.add = vi.fn<WorkspaceCapabilities["add"]>(async (params) => {
        const saved = await add(params);
        capabilities.read = vi
          .fn()
          .mockRejectedValue(new Error("Local read failed"));
        return {
          ...saved,
          syncUpload: outcome === "pending" ? "pending" : "complete",
          syncConfigured: outcome !== "local",
        };
      });
      const { result } = renderHook(() => useWorkspace("vault", capabilities));
      await waitFor(() => expect(result.current.data).toBeDefined());
      act(() => result.current.edit());
      await waitFor(() => expect(result.current.pending).toBe(false));
      act(() =>
        result.current.save({
          login: "new",
          url: "https://example.test",
          password: "private draft",
          tagIds: [],
          folderId: "uncategorized",
          allowWeakPassword: true,
        }),
      );
      await waitFor(() => expect(result.current.pending).toBe(false));
      expect(capabilities.add).toHaveBeenCalledOnce();
      expect(result.current.view.kind).toBe("list");
      expect(result.current.data).toBeUndefined();
      const feedback = result.current.feedback;
      expect(feedback).toContain(
        outcome === "pending"
          ? "not been confirmed"
          : outcome === "complete"
            ? "Saved and uploaded"
            : "Saved on this device",
      );
      expect(result.current.error).toContain("Could not reload entries");
      await act(async () => result.current.refresh());
      expect(result.current.feedback).toBe(feedback);
      expect(result.current.uploadPending).toBe(outcome === "pending");
      expect(capabilities.add).toHaveBeenCalledOnce();
      await act(async () => signal("session"));
      expect(result.current.feedback).toBeUndefined();
      expect(result.current.uploadPending).toBe(false);
    },
  );
  it("distinguishes an uncertain upload from a confirmed save and clears drafts", async () => {
    const capabilities = galleryWorkspace("workspace-pending-upload");
    const { result } = renderHook(() => useWorkspace("vault", capabilities));
    await waitFor(() => expect(result.current.data).toBeDefined());
    act(() => result.current.edit());
    await waitFor(() => expect(result.current.view.kind).toBe("editor"));
    act(() =>
      result.current.save({
        login: "other",
        url: "https://example.test",
        password: "password",
        tagIds: [],
        folderId: "uncategorized",
        allowWeakPassword: true,
      }),
    );
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.view.kind).toBe("list");
    expect(result.current.uploadPending).toBe(true);
    expect(result.current.feedback).toContain("not been confirmed");
  });
});

it("reviews a captured password update without replacing organization or saving automatically", async () => {
  const { capabilities } = fixture();
  const original = await capabilities.edit("vault", "entry-review");
  capabilities.update = vi.fn(capabilities.update);
  const { result } = renderHook(() => useWorkspace("vault", capabilities));
  await waitFor(() => expect(result.current.data).toBeDefined());
  act(() =>
    result.current.edit("entry-review", {
      login: "captured-user",
      password: "captured-new-password",
      url: "https://example.com/different",
    }),
  );
  await waitFor(() => expect(result.current.view.kind).toBe("editor"));
  const view = result.current.view;
  if (view.kind !== "editor") throw new Error("Expected review editor");
  expect(view.initial).toMatchObject({
    login: original.entry.login,
    url: original.entry.sanitizedUrl,
    password: "captured-new-password",
    folderId: original.entry.folderId,
    tagIds: original.entry.tags,
  });
  expect(view.version).toEqual(original.entry.versionVector);
  expect(capabilities.update).not.toHaveBeenCalled();
});
