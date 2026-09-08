import type { SiteIconCapabilities } from "@/ui/features/site-icons/site-icons.type";

const preferenceKey = "siteIconsEnabled";
const mutationLock = "lfspm:site-icons";
const permission: chrome.permissions.Permissions = { permissions: ["favicon"] };

class SiteIconCleanupError extends AggregateError {
  override name = "SiteIconCleanupError";
}

async function removePermission(): Promise<void> {
  const removed = await chrome.permissions.remove(permission);
  if (!removed && (await chrome.permissions.contains(permission)))
    throw new Error("Browser icon permission could not be removed.");
}

// Only the extension's Chromium manifest opts into this browser capability.
export function composeSiteIcons(): SiteIconCapabilities {
  const supported =
    chrome.runtime.getManifest().optional_permissions?.includes("favicon") ===
    true;
  return {
    async read() {
      if (!supported)
        return { supported: false, enabled: false, cleanupRequired: false };
      const [settings, granted] = await Promise.all([
        chrome.storage.local.get(preferenceKey),
        chrome.permissions.contains(permission),
      ]);
      const enabled = settings[preferenceKey] === true;
      return {
        supported,
        enabled: enabled && granted,
        cleanupRequired: granted !== enabled,
      };
    },
    async setEnabled(enabled) {
      if (!supported)
        throw new Error("Browser icons are unavailable in this browser.");
      if (enabled) {
        // Invoke the request before the first await to preserve the settings click's gesture.
        const requested = chrome.permissions.request(permission);
        const granted = await requested;
        if (!granted)
          throw Object.assign(new Error("Icon access was not allowed."), {
            name: "SiteIconPermissionDeniedError",
          });
        try {
          await navigator.locks.request(mutationLock, async () => {
            if (!(await chrome.permissions.contains(permission)))
              throw new Error(
                "Browser icon permission changed before enabling.",
              );
            const settings = await chrome.storage.local.get(preferenceKey);
            if (settings[preferenceKey] === true) return;
            await chrome.storage.local.set({ [preferenceKey]: true });
          });
        } catch (cause) {
          try {
            await navigator.locks.request(mutationLock, async () => {
              const current = await chrome.storage.local.get(preferenceKey);
              if (current[preferenceKey] !== true) await removePermission();
            });
          } catch (cleanupCause) {
            throw new SiteIconCleanupError(
              [cause, cleanupCause],
              "Browser icons could not be enabled or fully rolled back.",
            );
          }
          throw cause;
        }
        return;
      }
      await navigator.locks.request(mutationLock, async () => {
        const [preferenceResult, permissionResult] = await Promise.allSettled([
          chrome.storage.local.set({ [preferenceKey]: false }),
          removePermission(),
        ]);
        const failures = [preferenceResult, permissionResult].flatMap(
          (result) => (result.status === "rejected" ? [result.reason] : []),
        );
        if (failures.length)
          throw new SiteIconCleanupError(
            failures,
            "Browser icons could not be fully disabled.",
          );
      });
    },
    subscribe(listener) {
      const changed = (
        changes: Record<string, chrome.storage.StorageChange>,
        area: string,
      ) => {
        if (area === "local" && preferenceKey in changes) listener();
      };
      const permissionsChanged = (value: chrome.permissions.Permissions) => {
        if (value.permissions?.includes("favicon")) listener();
      };
      chrome.storage.onChanged.addListener(changed);
      chrome.permissions.onAdded.addListener(permissionsChanged);
      chrome.permissions.onRemoved.addListener(permissionsChanged);
      return () => {
        chrome.storage.onChanged.removeListener(changed);
        chrome.permissions.onAdded.removeListener(permissionsChanged);
        chrome.permissions.onRemoved.removeListener(permissionsChanged);
      };
    },
    source(value) {
      if (!supported) return undefined;
      try {
        const url = new URL(value);
        if (
          !["http:", "https:"].includes(url.protocol) ||
          url.username ||
          url.password
        )
          return undefined;
        const icon = new URL(chrome.runtime.getURL("/_favicon/"));
        icon.searchParams.set("pageUrl", url.origin + "/");
        icon.searchParams.set("size", "32");
        return icon.href;
      } catch {
        return undefined;
      }
    },
  };
}
