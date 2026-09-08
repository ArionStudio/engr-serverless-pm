import { browserLoginPageOrigin } from "./browser-login-url";
import type {
  BrowserLoginPort,
  BrowserLoginTarget,
  BrowserLoginForm,
} from "@lfspm/core";

const FILL_RESPONSE_TIMEOUT_MS = 5_000;

function isForm(value: unknown): value is BrowserLoginForm | null {
  if (value === null) return true;
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    ["identifier", "sign-in", "registration", "password-change"].includes(
      String(value.kind),
    ) &&
    "fields" in value &&
    Array.isArray(value.fields) &&
    value.fields.length <= 5 &&
    value.fields.every(
      (field: unknown) =>
        typeof field === "string" &&
        [
          "email",
          "username",
          "current-password",
          "new-password",
          "confirm-password",
        ].includes(field),
    )
  );
}
export class ChromeBrowserLoginAdapter implements BrowserLoginPort {
  async inspect(): Promise<BrowserLoginTarget | null> {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id === undefined || !tab.url || !browserLoginPageOrigin(tab.url))
      return null;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [0] },
        files: ["login-content.js"],
      });
      const value: unknown = await chrome.tabs.sendMessage(
        tab.id,
        { channel: "lfspm-login", action: "inspect" },
        { frameId: 0 },
      );
      if (
        !value ||
        typeof value !== "object" ||
        !("documentToken" in value) ||
        typeof value.documentToken !== "string" ||
        !("url" in value) ||
        value.url !== tab.url ||
        !("form" in value) ||
        !isForm(value.form) ||
        !("formToken" in value) ||
        !(value.formToken === null || typeof value.formToken === "string") ||
        !("fillable" in value) ||
        typeof value.fillable !== "boolean"
      )
        return null;
      return {
        tabId: tab.id,
        url: value.url,
        documentToken: value.documentToken,
        form: value.form,
        formToken: value.formToken,
        fillable: value.fillable,
      };
    } catch {
      throw new Error(
        "Could not inspect this page. Refresh it and reopen LFSPM.",
      );
    }
  }
  async fill(
    target: BrowserLoginTarget,
    credentials: { readonly login: string; readonly password: string },
  ): Promise<void> {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id !== target.tabId || tab.url !== target.url)
      throw new Error("The page changed. Open the popup again before filling.");
    const deadlineEpochMs = Date.now() + FILL_RESPONSE_TIMEOUT_MS;
    let responseTimeout: ReturnType<typeof setTimeout> | undefined;
    let result: unknown;
    try {
      result = await Promise.race([
        new Promise<never>((_, reject) => {
          responseTimeout = setTimeout(() => {
            reject(
              new Error("Filling timed out. Check the page and try again."),
            );
          }, FILL_RESPONSE_TIMEOUT_MS);
        }),
        chrome.tabs.sendMessage(
          target.tabId,
          {
            channel: "lfspm-login",
            action: "fill",
            ...target,
            ...credentials,
            deadlineEpochMs,
          },
          { frameId: 0 },
        ),
      ]);
    } finally {
      if (responseTimeout !== undefined) clearTimeout(responseTimeout);
    }
    if (
      !result ||
      typeof result !== "object" ||
      !("filled" in result) ||
      result.filled !== true
    )
      throw new Error(
        "Could not fill this form. Check the page and try again.",
      );
  }
}
