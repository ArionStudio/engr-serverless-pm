import {
  CAPTURED_LOGIN_STORAGE_LOCK,
  CAPTURED_LOGIN_STORAGE_PREFIX,
  clearCapturedLogins,
} from "../../adapters/browser-login/chrome-captured-login-repository.adapter";
import { UNLOCKED_VAULT_SESSION_MATERIAL_STORAGE_KEY } from "../../adapters/storage/chrome-unlocked-vault-session-material-repository.adapter";
import { browserLoginPageOrigin } from "../../adapters/browser-login/browser-login-url";
const registrationId = "lfspm-login-detection";
export const loginDetectionOrigins = [
  "https://*/*",
  "http://localhost/*",
  "http://127.0.0.1/*",
  "http://[::1]/*",
];
export async function loginDetectionEnabled(): Promise<boolean> {
  const settings = await chrome.storage.local.get("loginDetectionEnabled");
  return (
    settings.loginDetectionEnabled === true &&
    (await chrome.permissions.contains({ origins: loginDetectionOrigins }))
  );
}

async function unregisterLoginDetection(): Promise<void> {
  const registered = await chrome.scripting.getRegisteredContentScripts({
    ids: [registrationId],
  });
  if (registered.length)
    await chrome.scripting.unregisterContentScripts({ ids: [registrationId] });
}

async function registerLoginDetection(): Promise<void> {
  const registered = await chrome.scripting.getRegisteredContentScripts({
    ids: [registrationId],
  });
  if (registered.length === 0)
    await chrome.scripting.registerContentScripts([
      {
        id: registrationId,
        js: ["login-content.js"],
        matches: loginDetectionOrigins,
        allFrames: false,
        runAt: "document_idle",
        persistAcrossSessions: true,
      },
    ]);
}

function reportFailures(
  results: PromiseSettledResult<unknown>[],
  message: string,
): void {
  const failures = results.flatMap((result) =>
    result.status === "rejected" ? [result.reason] : [],
  );
  if (failures.length) throw new AggregateError(failures, message);
}

/** Call while holding CAPTURED_LOGIN_STORAGE_LOCK. */
async function reconcileLoginDetectionLocked(): Promise<void> {
  const settings = await chrome.storage.local.get("loginDetectionEnabled");
  const requested = settings.loginDetectionEnabled === true;
  const enabled =
    requested &&
    (await chrome.permissions.contains({ origins: loginDetectionOrigins }));
  if (!enabled) {
    // Already-injected scripts observe this preference and stop reading fields.
    const cleanup = requested
      ? [
          chrome.storage.local.set({ loginDetectionEnabled: false }),
          clearCapturedLogins(),
          unregisterLoginDetection(),
        ]
      : [clearCapturedLogins(), unregisterLoginDetection()];
    reportFailures(
      await Promise.allSettled(cleanup),
      "Login detection could not be fully disabled.",
    );
    return;
  }
  await registerLoginDetection();
}

export async function reconcileLoginDetection(): Promise<void> {
  await navigator.locks.request(CAPTURED_LOGIN_STORAGE_LOCK, () =>
    reconcileLoginDetectionLocked(),
  );
}
export async function setLoginDetection(enabled: boolean): Promise<void> {
  if (enabled) {
    const declared =
      chrome.runtime.getManifest().optional_host_permissions ?? [];
    if (!loginDetectionOrigins.every((origin) => declared.includes(origin)))
      throw new Error(
        "Reload LFSPM in your browser’s Extensions page to finish the update, then enable login detection.",
      );
  }
  if (
    enabled &&
    !(await chrome.permissions.request({ origins: loginDetectionOrigins }))
  )
    throw new Error("Website access was not allowed.");
  await navigator.locks.request(CAPTURED_LOGIN_STORAGE_LOCK, async () => {
    if (enabled) {
      await registerLoginDetection();
      await chrome.storage.local.set({ loginDetectionEnabled: true });
      return;
    }
    reportFailures(
      await Promise.allSettled([
        chrome.storage.local.set({ loginDetectionEnabled: false }),
        clearCapturedLogins(),
        unregisterLoginDetection(),
      ]),
      "Login detection could not be fully disabled.",
    );
  });
  if (enabled) {
    const tabs = await chrome.tabs.query({ active: true });
    await Promise.allSettled(
      tabs
        .filter(
          (tab) =>
            tab.id !== undefined &&
            tab.url !== undefined &&
            browserLoginPageOrigin(tab.url) !== null,
        )
        .map((tab) =>
          chrome.scripting.executeScript({
            target: { tabId: tab.id!, frameIds: [0] },
            files: ["login-content.js"],
          }),
        ),
    );
  }
}

export async function capturedLoginSessionRetentionEnabled(): Promise<boolean> {
  const settings = await chrome.storage.local.get(
    "capturedLoginSessionRetention",
  );
  return settings.capturedLoginSessionRetention === true;
}
export async function setCapturedLoginSessionRetention(
  enabled: boolean,
): Promise<void> {
  await navigator.locks.request(CAPTURED_LOGIN_STORAGE_LOCK, async () => {
    if (!enabled) await clearCapturedLogins();
    await chrome.storage.local.set({ capturedLoginSessionRetention: enabled });
  });
}

export async function reconcileClosedTabCaptures(): Promise<void> {
  await navigator.locks.request(CAPTURED_LOGIN_STORAGE_LOCK, async () => {
    const tabs = await chrome.tabs.query({});
    const openKeys = new Set(
      tabs.flatMap((tab) =>
        tab.id === undefined ? [] : [CAPTURED_LOGIN_STORAGE_PREFIX + tab.id],
      ),
    );
    await clearCapturedLogins(
      (_value, storageKey) => !openKeys.has(storageKey),
    );
  });
}

async function clearInactiveSessionCaptures(): Promise<void> {
  await navigator.locks.request(CAPTURED_LOGIN_STORAGE_LOCK, async () => {
    // Read the current identity inside the lock so an older event cannot
    // discard a new session's capture.
    const stored = await chrome.storage.session.get(
      UNLOCKED_VAULT_SESSION_MATERIAL_STORAGE_KEY,
    );
    const material: unknown =
      stored[UNLOCKED_VAULT_SESSION_MATERIAL_STORAGE_KEY];
    const sessionId =
      material && typeof material === "object" && "sessionId" in material
        ? material.sessionId
        : null;
    await clearCapturedLogins((value) => value.sessionId !== sessionId);
  });
}
export async function clearClosedTabCapture(tabId: number): Promise<void> {
  await navigator.locks.request(CAPTURED_LOGIN_STORAGE_LOCK, () =>
    chrome.storage.session.remove(CAPTURED_LOGIN_STORAGE_PREFIX + tabId),
  );
}
export function installCapturedLoginSessionCleanup(): void {
  const clear = () => {
    void clearInactiveSessionCaptures().catch(() => {
      // Session-bound encryption still prevents reads after session replacement.
    });
  };
  chrome.storage.onChanged.addListener((changes, area) => {
    if (
      area === "session" &&
      changes[UNLOCKED_VAULT_SESSION_MATERIAL_STORAGE_KEY]
    )
      clear();
  });
  clear();
}
