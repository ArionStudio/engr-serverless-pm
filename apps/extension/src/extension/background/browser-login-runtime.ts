import { isLiveBrowserLoginDeadline } from "../../adapters/browser-login/browser-login-deadline";
import type { BrowserLoginRuntimeCapabilities } from "../composition/browser-login-application.type";
import { browserLoginPageOrigin } from "../../adapters/browser-login/browser-login-url";
import { openDetectedPopup } from "../composition/popup-route";
import {
  loginDetectionEnabled,
  installCapturedLoginSessionCleanup,
  clearClosedTabCapture,
  reconcileLoginDetection,
  reconcileClosedTabCaptures,
} from "../composition/login-detection";
export async function handleBrowserLoginMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender,
  app: BrowserLoginRuntimeCapabilities,
): Promise<unknown> {
  if (
    sender.id !== chrome.runtime.id ||
    sender.frameId !== 0 ||
    sender.tab?.id === undefined ||
    !sender.url ||
    !browserLoginPageOrigin(sender.url) ||
    !message ||
    typeof message !== "object" ||
    !("channel" in message) ||
    message.channel !== "lfspm-login" ||
    !("action" in message)
  )
    return undefined;
  const sideEffect =
    message.action === "capture" ||
    message.action === "open-popup" ||
    message.action === "open-detected";
  const deadline =
    "deadlineEpochMs" in message ? message.deadlineEpochMs : undefined;
  if (sideEffect && !isLiveBrowserLoginDeadline(deadline))
    return { captured: false, opened: false };
  if (!(await loginDetectionEnabled()))
    return { captured: false, pending: false, opened: false };
  const tab = await chrome.tabs.get(sender.tab.id);
  if (
    !tab.url ||
    browserLoginPageOrigin(tab.url) !== browserLoginPageOrigin(sender.url)
  )
    return { captured: false, pending: false, opened: false };
  if (sideEffect && !isLiveBrowserLoginDeadline(deadline))
    return { captured: false, opened: false };
  if (
    message.action === "open-detected" &&
    isLiveBrowserLoginDeadline(deadline)
  ) {
    // A content script retains its original sender URL across same-document
    // navigation. Origin and active-tab checks above/below still bind this action.
    if (!tab.active) return { opened: false };
    return {
      opened: await openDetectedPopup(sender.tab.id, tab.windowId, deadline),
    };
  }
  if (
    message.action === "capture" &&
    isLiveBrowserLoginDeadline(deadline) &&
    "url" in message &&
    typeof message.url === "string" &&
    browserLoginPageOrigin(message.url) ===
      browserLoginPageOrigin(sender.url) &&
    "login" in message &&
    typeof message.login === "string" &&
    "password" in message &&
    typeof message.password === "string"
  ) {
    return app.capture.execute({
      tabId: sender.tab.id,
      url: message.url,
      login: message.login,
      password: message.password,
      deadlineEpochMs: deadline,
    });
  }
  if (message.action === "pending")
    return {
      pending: await app.pending.execute({
        tabId: sender.tab.id,
        url: sender.url,
      }),
    };
  if (
    message.action === "open-popup" &&
    tab.active &&
    (await app.pending.execute({ tabId: sender.tab.id, url: sender.url })) &&
    isLiveBrowserLoginDeadline(deadline)
  ) {
    return {
      opened: await openDetectedPopup(sender.tab.id, tab.windowId, deadline),
    };
  }
  return undefined;
}
export function installBrowserLoginRuntime(
  app: BrowserLoginRuntimeCapabilities,
): void {
  installCapturedLoginSessionCleanup();
  chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
    if (
      !message ||
      typeof message !== "object" ||
      !("channel" in message) ||
      message.channel !== "lfspm-login"
    )
      return;
    void handleBrowserLoginMessage(message, sender, app).then(respond, () =>
      respond({ captured: false, pending: false, opened: false }),
    );
    return true;
  });
  const reconcile = () => {
    void Promise.all([
      reconcileLoginDetection(),
      reconcileClosedTabCaptures(),
    ]).catch(() => {
      /* Permission changes can race extension updates. Retry on the next event. */
    });
  };
  chrome.runtime.onInstalled.addListener(reconcile);
  chrome.runtime.onStartup.addListener(reconcile);
  chrome.permissions.onRemoved.addListener(reconcile);
  chrome.tabs.onRemoved.addListener((tabId) => {
    void clearClosedTabCapture(tabId).catch(() => {
      /* Retry cleanup when the worker starts again. */
    });
  });
  reconcile();
}
