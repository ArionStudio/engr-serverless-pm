import type { ExtensionApplication } from "./extension-application";
import {
  OPTIONS_ROUTE_MESSAGE_TYPE,
  type OptionsRoute,
} from "@/ui/entrypoints/options/options-route";

// One lazy application graph per extension context, never constructed in render.
let application: Promise<ExtensionApplication> | undefined;
export function getApplication() {
  application ??= import("./extension-application")
    .then(({ composeExtensionApplication }) => composeExtensionApplication())
    .catch((error: unknown) => {
      application = undefined;
      throw error;
    });
  return application;
}
export async function readLocalVaultCount() {
  const { vaults } = await (await getApplication()).listLocalVaults.execute();
  return vaults.length;
}
export async function assessSetupPassword(password: string) {
  return (await getApplication()).checkPasswordStrength.execute({ password });
}
export async function openOptionsPage(route?: OptionsRoute) {
  if (!route) {
    await chrome.runtime.openOptionsPage();
    return;
  }
  const baseUrl = chrome.runtime.getURL("options.html");
  const url = `${baseUrl}#${route}`;
  const contexts = await chrome.runtime.getContexts({ contextTypes: ["TAB"] });
  const existing = contexts.find(
    (context) => context.documentUrl?.split("#", 1)[0] === baseUrl,
  );
  if (existing?.tabId !== undefined && existing.tabId !== -1) {
    await chrome.tabs.update(existing.tabId, { active: true, url });
    if (existing.windowId !== undefined && existing.windowId !== -1)
      await chrome.windows.update(existing.windowId, { focused: true });
    await chrome.runtime
      .sendMessage({ type: OPTIONS_ROUTE_MESSAGE_TYPE, route })
      .catch(() => undefined);
    return;
  }
  await chrome.tabs.create({ url });
}
