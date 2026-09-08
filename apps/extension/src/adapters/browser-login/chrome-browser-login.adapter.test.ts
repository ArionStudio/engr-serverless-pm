import { afterEach, describe, expect, it, vi } from "vitest";
import { ChromeBrowserLoginAdapter } from "./chrome-browser-login.adapter";

const target = {
  tabId: 7,
  url: "https://example.com/login",
  documentToken: "document-token",
  fillable: true,
  form: { kind: "sign-in" as const, fields: ["current-password" as const] },
  formToken: "form-1",
};
afterEach(() => vi.unstubAllGlobals());

describe("browser fill dispatch", () => {
  it("refuses credentials when the active tab or its URL changed since inspection", async () => {
    const sendMessage = vi.fn();
    const query = vi.fn();
    vi.stubGlobal("chrome", { tabs: { query, sendMessage } });
    const adapter = new ChromeBrowserLoginAdapter();
    for (const tab of [
      { id: 8, url: target.url },
      { id: 7, url: "https://other.example/" },
    ]) {
      query.mockResolvedValueOnce([tab]);
      await expect(
        adapter.fill(target, { login: "alice", password: "secret" }),
      ).rejects.toThrow("page changed");
    }
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("requires the top document to confirm filling the inspected document token", async () => {
    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce({ filled: false })
      .mockResolvedValueOnce({ filled: true });
    vi.stubGlobal("chrome", {
      tabs: {
        query: vi.fn(async () => [{ id: 7, url: target.url }]),
        sendMessage,
      },
    });
    const adapter = new ChromeBrowserLoginAdapter();
    await expect(
      adapter.fill(target, { login: "alice", password: "secret" }),
    ).rejects.toThrow();
    await expect(
      adapter.fill(target, { login: "alice", password: "secret" }),
    ).resolves.toBeUndefined();
    expect(sendMessage).toHaveBeenLastCalledWith(
      7,
      {
        channel: "lfspm-login",
        action: "fill",
        ...target,
        login: "alice",
        password: "secret",
        deadlineEpochMs: expect.any(Number),
      },
      { frameId: 0 },
    );
  });
});

describe("browser page inspection", () => {
  it("skips unsupported pages without requesting script access", async () => {
    const executeScript = vi.fn();
    vi.stubGlobal("chrome", {
      tabs: {
        query: vi.fn(async () => [{ id: 7, url: "chrome://extensions" }]),
      },
      scripting: { executeScript },
    });
    await expect(new ChromeBrowserLoginAdapter().inspect()).resolves.toBeNull();
    expect(executeScript).not.toHaveBeenCalled();
  });

  it.each(["injection", "message"])(
    "reports a safe actionable error after %s fails",
    async (failure) => {
      const privateError = new Error("private page details");
      vi.stubGlobal("chrome", {
        tabs: {
          query: vi.fn(async () => [{ id: 7, url: target.url }]),
          sendMessage: vi.fn(async () => {
            throw privateError;
          }),
        },
        scripting: {
          executeScript: vi.fn(async () => {
            if (failure === "injection") throw privateError;
          }),
        },
      });
      await expect(new ChromeBrowserLoginAdapter().inspect()).rejects.toEqual(
        new Error("Could not inspect this page. Refresh it and reopen LFSPM."),
      );
    },
  );
});
