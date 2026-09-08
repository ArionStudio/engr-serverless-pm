import { composeSiteIcons } from "../browser/site-icons";
import { SiteIconsProvider } from "@/ui/features/site-icons/site-icons-provider.view";
import { composePopupSync } from "../composition/popup-sync.capabilities";
import { consumePopupReviewRequest } from "../composition/popup-route";
import { composeVaultSettings } from "../composition/vault-settings.capabilities";
import { composeBrowserLogins } from "../composition/browser-login.capabilities";
import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "@/ui/features/theme";
import "@/ui/styles/index.css";
import { PopupWorkspace } from "@/ui/entrypoints/popup/popup-workspace.view";
import { composeWorkspace } from "../composition/workspace.capabilities";
import { composeVaultSetup } from "../composition/vault-setup.capabilities";
import { openOptionsPage } from "../composition/first-launch.capabilities";

export function Popup({
  initialRoute = "vault",
}: {
  initialRoute?: "vault" | "detected";
}) {
  const [siteIcons] = React.useState(composeSiteIcons);
  const [browserLogins] = React.useState(composeBrowserLogins);
  const [sync] = React.useState(composePopupSync);
  const [settings] = React.useState(composeVaultSettings);
  const [workspace] = React.useState(composeWorkspace);
  const [setup] = React.useState(composeVaultSetup);
  return (
    <SiteIconsProvider capabilities={siteIcons}>
      <PopupWorkspace
        initialRoute={initialRoute}
        setup={setup}
        workspace={workspace}
        settings={settings}
        sync={sync}
        browserLogins={browserLogins}
        onOpenOptions={openOptionsPage}
      />
    </SiteIconsProvider>
  );
}

const rootElement = document.getElementById("popup");
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  void consumePopupReviewRequest()
    .catch(() => "vault" as const)
    .then((initialRoute) => {
      root.render(
        <React.StrictMode>
          <ThemeProvider>
            <Popup initialRoute={initialRoute} />
          </ThemeProvider>
        </React.StrictMode>,
      );
    });
}
