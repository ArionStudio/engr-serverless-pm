// @vitest-environment jsdom
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { BrowserLoginTarget } from "@lfspm/core";
import { ChromeBrowserLoginAdapter } from "../../adapters/browser-login/chrome-browser-login.adapter";

const promptMounts = vi.hoisted<HTMLElement[]>(() => []);
vi.mock("./login-capture-prompt", () => ({
  mountLoginCapturePrompt: vi.fn((container: HTMLElement) => {
    promptMounts.push(container);
    return () => container.remove();
  }),
}));

type Listener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  respond: (value: unknown) => void,
) => void;
const listeners: Listener[] = [];
const storageListeners: Array<
  (changes: Record<string, chrome.storage.StorageChange>, area: string) => void
> = [];
const sendMessage = vi.fn<(message: unknown) => Promise<{ pending: boolean }>>(
  async () => ({ pending: false }),
);

beforeAll(async () => {
  window.history.replaceState(null, "", "/login");
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([
    new DOMRect(0, 0, 200, 30),
  ] as unknown as DOMRectList);
  vi.stubGlobal("chrome", {
    storage: {
      local: { get: vi.fn(async () => ({})) },
      onChanged: {
        addListener: (
          listener: (
            changes: Record<string, chrome.storage.StorageChange>,
            area: string,
          ) => void,
        ) => storageListeners.push(listener),
      },
    },
    runtime: {
      id: "lfspm-test",
      sendMessage,
      onMessage: {
        addListener: (listener: Listener) => listeners.push(listener),
      },
    },
  });
  document.body.innerHTML =
    '<form><input autocomplete="username"><input type="password" autocomplete="current-password"><button>Log in</button></form>';
  await import("./login-content");
});
afterAll(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

it("accepts fill only from its extension and the inspected document at the exact URL", () => {
  const listener = listeners[0];
  const inspected = vi.fn();
  listener(
    { channel: "lfspm-login", action: "inspect" },
    { id: "lfspm-test" },
    inspected,
  );
  const target = inspected.mock.calls[0][0] as {
    documentToken: string;
    url: string;
  };
  const filled = vi.fn();
  const message = {
    channel: "lfspm-login",
    action: "fill",
    ...target,
    login: "alice",
    password: "secret",
    deadlineEpochMs: Date.now() + 5_000,
  };
  listener(message, { id: "other-extension" }, filled);
  listener(
    message,
    { id: "lfspm-test", tab: { id: 1 } as chrome.tabs.Tab },
    filled,
  );
  expect(filled).not.toHaveBeenCalled();
  listener(
    { ...message, documentToken: "previous-document" },
    { id: "lfspm-test" },
    filled,
  );
  expect(filled).toHaveBeenLastCalledWith(
    expect.objectContaining({ filled: false }),
  );
  window.history.replaceState(null, "", "/changed");
  listener(message, { id: "lfspm-test" }, filled);
  expect(filled).toHaveBeenLastCalledWith(
    expect.objectContaining({ filled: false }),
  );
  expect(
    document.querySelector<HTMLInputElement>('[type="password"]')!.value,
  ).toBe("");
  window.history.replaceState(null, "", "/login");
  listener(message, { id: "lfspm-test" }, filled);
  expect(filled).toHaveBeenLastCalledWith({ filled: true });
  expect(
    document.querySelector<HTMLInputElement>('[type="password"]')!.value,
  ).toBe("secret");
});

it("stops before the password when page handlers consume the fill deadline", () => {
  const listener = listeners[0];
  const inspect = vi.fn();
  const username = document.querySelector<HTMLInputElement>(
    '[autocomplete="username"]',
  )!;
  const password = document.querySelector<HTMLInputElement>(
    '[autocomplete="current-password"]',
  )!;
  username.value = "";
  password.value = "";
  listener(
    { channel: "lfspm-login", action: "inspect" },
    { id: "lfspm-test" },
    inspect,
  );
  vi.useFakeTimers();
  const deadlineEpochMs = Date.now() + 100;
  const crossDeadline = () => vi.setSystemTime(deadlineEpochMs);
  username.addEventListener("input", crossDeadline);
  const result = vi.fn();

  try {
    listener(
      {
        ...inspect.mock.calls[0][0],
        channel: "lfspm-login",
        action: "fill",
        login: "alice",
        password: "secret",
        deadlineEpochMs,
      },
      { id: "lfspm-test" },
      result,
    );
    expect(result).toHaveBeenCalledWith({ filled: false });
    expect(username.value).toBe("alice");
    expect(password.value).toBe("");
  } finally {
    username.removeEventListener("input", crossDeadline);
    vi.useRealTimers();
  }
});

it("reports failed fill when a page replaces the password input with an empty field", () => {
  const listener = listeners[0];
  const inspected = vi.fn();
  listener(
    { channel: "lfspm-login", action: "inspect" },
    { id: "lfspm-test" },
    inspected,
  );
  const password = document.querySelector<HTMLInputElement>(
    '[autocomplete="current-password"]',
  )!;
  password.addEventListener(
    "input",
    () => {
      const replacement = password.cloneNode() as HTMLInputElement;
      replacement.value = "";
      password.replaceWith(replacement);
    },
    { once: true },
  );
  const result = vi.fn();
  listener(
    {
      ...inspected.mock.calls[0][0],
      channel: "lfspm-login",
      action: "fill",
      login: "alice",
      password: "secret",
      deadlineEpochMs: Date.now() + 5_000,
    },
    { id: "lfspm-test" },
    result,
  );
  expect(result).toHaveBeenCalledWith({ filled: false });
  expect(
    document.querySelector<HTMLInputElement>('[type="password"]')!.value,
  ).toBe("");
});

it("never captures autofill input events or synthetic page submissions", async () => {
  sendMessage.mockClear();
  document
    .querySelector("input")!
    .dispatchEvent(new Event("input", { bubbles: true }));
  document.querySelector("button")!.type = "button";
  document
    .querySelector("button")!
    .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  document
    .querySelector("form")!
    .dispatchEvent(new Event("submit", { bubbles: true }));
  document
    .querySelector("input")!
    .dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  await Promise.resolve();
  expect(sendMessage).not.toHaveBeenCalled();
});

it("rejects a replaced form even if the document and URL are unchanged", () => {
  const inspect = vi.fn();
  const listener = listeners[0];
  listener(
    { channel: "lfspm-login", action: "inspect" },
    { id: "lfspm-test" },
    inspect,
  );
  const target = inspect.mock.calls[0][0] as object;
  const form = document.querySelector("form")!;
  form.replaceWith(form.cloneNode(true));
  const result = vi.fn();
  listener(
    {
      ...target,
      channel: "lfspm-login",
      action: "fill",
      login: "alice",
      password: "secret",
      deadlineEpochMs: Date.now() + 5_000,
    },
    { id: "lfspm-test" },
    result,
  );
  expect(result).toHaveBeenCalledWith(
    expect.objectContaining({ filled: false }),
  );
});

it("times out a queued fill and leaves the page untouched when it is delivered late", async () => {
  const listener = listeners[0];
  const inspect = vi.fn();
  listener(
    { channel: "lfspm-login", action: "inspect" },
    { id: "lfspm-test" },
    inspect,
  );
  const target = {
    ...inspect.mock.calls[0][0],
    tabId: 7,
  } as BrowserLoginTarget;
  const fields = Array.from(document.querySelectorAll("input"));
  fields.forEach((field) => {
    field.value = "";
  });
  const originalChrome = chrome;
  const response = vi.fn();
  let deliver: (() => void) | undefined;
  let deadlineEpochMs = 0;
  vi.useFakeTimers();
  vi.stubGlobal("chrome", {
    ...originalChrome,
    tabs: {
      query: vi.fn(async () => [{ id: target.tabId, url: target.url }]),
      sendMessage: vi.fn(
        (_tabId: number, message: { deadlineEpochMs: number }) => {
          deadlineEpochMs = message.deadlineEpochMs;
          return new Promise((resolve) => {
            deliver = () =>
              listener(message, { id: "lfspm-test" }, (value) => {
                response(value);
                resolve(value);
              });
          });
        },
      ),
    },
  });
  try {
    const fill = new ChromeBrowserLoginAdapter().fill(target, {
      login: "alice",
      password: "secret",
    });
    const outcome = expect(fill).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(0);
    expect(deadlineEpochMs).toBeGreaterThan(Date.now());
    await vi.advanceTimersByTimeAsync(deadlineEpochMs - Date.now());
    await outcome;
    expect(deliver).toBeDefined();
    deliver?.();
    expect(response).toHaveBeenCalledWith(
      expect.objectContaining({ filled: false }),
    );
    expect(fields.map((field) => field.value)).toEqual(["", ""]);
  } finally {
    vi.useRealTimers();
    vi.stubGlobal("chrome", originalChrome);
  }
});

async function reinstallWithPending(
  pending: Promise<{ pending: boolean }>,
): Promise<void> {
  Reflect.deleteProperty(globalThis, Symbol.for("lfspm.loginContent"));
  sendMessage.mockImplementation((message: unknown) => {
    if (
      typeof message === "object" &&
      message !== null &&
      "action" in message &&
      message.action === "pending"
    )
      return pending;
    return Promise.resolve({ pending: false });
  });
  vi.resetModules();
  await import("./login-content");
  await Promise.resolve();
}

it("removes an existing prompt when login detection is turned off", async () => {
  await reinstallWithPending(Promise.resolve({ pending: true }));
  const prompt = promptMounts.at(-1);
  expect(prompt?.isConnected).toBe(true);

  for (const listener of storageListeners)
    listener(
      { loginDetectionEnabled: { oldValue: true, newValue: false } },
      "local",
    );

  expect(prompt?.isConnected).toBe(false);
});

it("does not remount a delayed prompt after login retention is turned off", async () => {
  let resolvePending!: (value: { pending: boolean }) => void;
  const pending = new Promise<{ pending: boolean }>((resolve) => {
    resolvePending = resolve;
  });
  const previousMounts = promptMounts.length;
  await reinstallWithPending(pending);

  for (const listener of storageListeners)
    listener(
      {
        capturedLoginSessionRetention: { oldValue: true, newValue: false },
      },
      "local",
    );
  resolvePending({ pending: true });
  await pending;
  await Promise.resolve();

  expect(promptMounts).toHaveLength(previousMounts);
});
