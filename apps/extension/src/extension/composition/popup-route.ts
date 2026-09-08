import { isLiveBrowserLoginDeadline } from "../../adapters/browser-login/browser-login-deadline";
const POPUP_REVIEW_REQUEST_KEY = "lfspm:popup-review-request";

async function withRequestLock<T>(operation: () => Promise<T>): Promise<T> {
  return await navigator.locks.request(POPUP_REVIEW_REQUEST_KEY, operation);
}

export async function openDetectedPopup(
  tabId: number,
  windowId: number,
  deadlineEpochMs: number,
): Promise<boolean> {
  const token = crypto.randomUUID();
  const key = `${POPUP_REVIEW_REQUEST_KEY}:${windowId}`;
  const ready = await withRequestLock(async () => {
    if (!isLiveBrowserLoginDeadline(deadlineEpochMs)) return false;
    await chrome.storage.session.set({ [key]: { tabId, token } });
    return true;
  });
  if (!ready) return false;
  try {
    if (!isLiveBrowserLoginDeadline(deadlineEpochMs))
      throw new Error("Popup request expired.");
    await chrome.action.openPopup({ windowId });
    return true;
  } catch {
    await withRequestLock(async () => {
      const stored = await chrome.storage.session.get(key);
      const request: unknown = stored[key];
      if (
        request !== null &&
        typeof request === "object" &&
        "token" in request &&
        request.token === token
      ) {
        await chrome.storage.session.remove(key);
      }
    });
    return false;
  }
}

export async function consumePopupReviewRequest(): Promise<
  "vault" | "detected"
> {
  return withRequestLock(async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.windowId === undefined) return "vault";
    const key = `${POPUP_REVIEW_REQUEST_KEY}:${tab.windowId}`;
    const stored = await chrome.storage.session.get(key);
    const request: unknown = stored[key];
    if (request === undefined) return "vault";
    await chrome.storage.session.remove(key);
    return request !== null &&
      typeof request === "object" &&
      "token" in request &&
      typeof request.token === "string" &&
      "tabId" in request &&
      typeof request.tabId === "number" &&
      request.tabId === tab?.id
      ? "detected"
      : "vault";
  });
}
