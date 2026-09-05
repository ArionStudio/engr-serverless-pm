import type { ExtensionApplication } from "./extension-application";

// One lazy application graph per extension context, never constructed in render.
let application: Promise<ExtensionApplication> | undefined;
function getApplication() {
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
export function openOptionsPage() {
  return chrome.runtime.openOptionsPage();
}
