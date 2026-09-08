import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(async () => true),
  capture: vi.fn(async () => ({ captured: true })),
  pending: vi.fn(async () => true),
}));
vi.mock("../composition/browser-login.composition", () => ({
  composeBrowserLoginApplication: () => ({
    capture: { execute: mocks.capture },
    pending: { execute: mocks.pending },
  }),
}));
vi.mock("../composition/login-detection", () => ({
  loginDetectionEnabled: mocks.enabled,
  reconcileLoginDetection: vi.fn(),
}));
import { handleBrowserLoginMessage as handleMessage } from "./browser-login-runtime";
const app = {
  capture: { execute: mocks.capture },
  pending: { execute: mocks.pending },
};
const handleBrowserLoginMessage = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
) => handleMessage(message, sender, app);

const url = "https://example.com/login";
const sender: chrome.runtime.MessageSender = {
  id: "lfspm-test",
  frameId: 0,
  url,
  tab: { id: 7 } as chrome.tabs.Tab,
};
const capture = {
  channel: "lfspm-login",
  action: "capture",
  deadlineEpochMs: Date.now() + 60_000,
  url,
  login: "alice",
  password: "secret",
};
const getTab = vi.fn(async () => ({ id: 7, url, active: true, windowId: 3 }));
const openPopup = vi.fn(async () => undefined);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled.mockResolvedValue(true);
  mocks.pending.mockResolvedValue(true);
  getTab.mockResolvedValue({ id: 7, url, active: true, windowId: 3 });
  vi.stubGlobal("navigator", {
    locks: {
      request: (_name: string, action: () => Promise<unknown>) => action(),
    },
  });
  vi.stubGlobal("chrome", {
    runtime: { id: "lfspm-test" },
    tabs: { get: getTab },
    action: { openPopup },
    storage: { session: { set: vi.fn(async () => {}) } },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("website login message boundary", () => {
  it("rejects other senders, child frames, insecure pages and disabled detection before capture", async () => {
    for (const untrusted of [
      { ...sender, id: "another-extension" },
      { ...sender, frameId: 1 },
      { ...sender, tab: undefined },
      { ...sender, url: "http://example.com/login" },
    ])
      await handleBrowserLoginMessage(capture, untrusted);
    mocks.enabled.mockResolvedValue(false);
    await handleBrowserLoginMessage(capture, sender);
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(getTab).not.toHaveBeenCalled();
  });

  it("binds capture to the sender URL and current tab origin, and opens only a pending review", async () => {
    await handleBrowserLoginMessage(
      { ...capture, url: "https://other.example/" },
      sender,
    );
    getTab.mockResolvedValueOnce({
      id: 7,
      url: "https://other.example/",
      active: true,
      windowId: 3,
    });
    await handleBrowserLoginMessage(capture, sender);
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(await handleBrowserLoginMessage(capture, sender)).toEqual({
      captured: true,
    });
    expect(mocks.capture).toHaveBeenCalledWith({
      tabId: 7,
      url,
      login: "alice",
      password: "secret",
      deadlineEpochMs: capture.deadlineEpochMs,
    });
    mocks.pending.mockResolvedValue(false);
    await handleBrowserLoginMessage(
      {
        channel: "lfspm-login",
        action: "open-popup",
        deadlineEpochMs: Date.now() + 5_000,
      },
      sender,
    );
    expect(openPopup).not.toHaveBeenCalled();
    mocks.pending.mockResolvedValue(true);
    expect(
      await handleBrowserLoginMessage(
        {
          channel: "lfspm-login",
          action: "open-popup",
          deadlineEpochMs: Date.now() + 5_000,
        },
        sender,
      ),
    ).toEqual({ opened: true });
  });
});

it("opens and captures after same-origin SPA navigation, but rejects inactive tabs and foreign origins", async () => {
  const route = "https://example.com/sign-in";
  getTab.mockResolvedValue({ id: 7, url: route, active: true, windowId: 3 });
  const message = {
    channel: "lfspm-login",
    action: "open-detected",
    deadlineEpochMs: Date.now() + 5_000,
  };
  expect(await handleBrowserLoginMessage(message, sender)).toEqual({
    opened: true,
  });
  expect(openPopup).toHaveBeenCalledWith({ windowId: 3 });
  await handleBrowserLoginMessage({ ...capture, url: route }, sender);
  expect(mocks.capture).toHaveBeenCalledWith(
    expect.objectContaining({ url: route }),
  );
  openPopup.mockClear();
  mocks.capture.mockClear();
  await handleBrowserLoginMessage(
    { ...capture, url: "https://other.example/sign-in" },
    sender,
  );
  getTab.mockResolvedValue({ id: 7, url: route, active: false, windowId: 3 });
  await handleBrowserLoginMessage(message, sender);
  getTab.mockResolvedValue({
    id: 7,
    url: "https://other.example/sign-in",
    active: true,
    windowId: 3,
  });
  await handleBrowserLoginMessage(message, sender);
  expect(openPopup).not.toHaveBeenCalled();
  expect(mocks.capture).not.toHaveBeenCalled();
});

it("rejects missing, invalid and expired side-effect deadlines before dispatch", async () => {
  for (const action of ["capture", "open-popup", "open-detected"]) {
    for (const deadlineEpochMs of [undefined, NaN, Date.now()])
      await handleBrowserLoginMessage(
        { ...capture, action, deadlineEpochMs },
        sender,
      );
  }
  expect(mocks.capture).not.toHaveBeenCalled();
  expect(openPopup).not.toHaveBeenCalled();
  expect(getTab).not.toHaveBeenCalled();
});
