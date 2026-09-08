import { isLiveBrowserLoginDeadline } from "../../adapters/browser-login/browser-login-deadline";
import { browserLoginPageOrigin } from "../../adapters/browser-login/browser-login-url";
import type {
  BrowserLoginApplication,
  BrowserLoginResources,
} from "./browser-login-application.type";
import {
  CaptureBrowserLoginUseCase,
  DismissCapturedLoginUseCase,
  FillBrowserLoginUseCase,
  HasCapturedLoginUseCase,
  ReadBrowserLoginsUseCase,
} from "@lfspm/core";
import { ChromeBrowserLoginAdapter } from "../../adapters/browser-login/chrome-browser-login.adapter";
import {
  CAPTURED_LOGIN_STORAGE_LOCK,
  ChromeCapturedLoginRepositoryAdapter,
} from "../../adapters/browser-login/chrome-captured-login-repository.adapter";
import {
  capturedLoginSessionRetentionEnabled,
  loginDetectionEnabled,
} from "./login-detection";
export function composeBrowserLoginApplication(
  resources: BrowserLoginResources,
): BrowserLoginApplication {
  const { unlockedVaultSession: session, clock, ids } = resources;
  const captured = new ChromeCapturedLoginRepositoryAdapter();
  const browser = new ChromeBrowserLoginAdapter();
  const capture = new CaptureBrowserLoginUseCase(session, captured, clock, ids);
  return {
    capture: {
      execute: async (params) =>
        navigator.locks.request(CAPTURED_LOGIN_STORAGE_LOCK, async () => {
          if (!isLiveBrowserLoginDeadline(params.deadlineEpochMs))
            return { captured: false };
          if (!(await loginDetectionEnabled())) return { captured: false };
          try {
            const tab = await chrome.tabs.get(params.tabId);
            const origin = browserLoginPageOrigin(params.url);
            if (
              !origin ||
              !tab.url ||
              browserLoginPageOrigin(tab.url) !== origin
            )
              return { captured: false };
          } catch {
            return { captured: false };
          }
          return capture.execute({
            ...params,
            retainForSession: await capturedLoginSessionRetentionEnabled(),
          });
        }),
    },
    read: new ReadBrowserLoginsUseCase(session, browser, captured, clock),
    fill: new FillBrowserLoginUseCase(session, browser),
    dismiss: new DismissCapturedLoginUseCase(session, captured),
    pending: new HasCapturedLoginUseCase(session, captured, clock),
  };
}
