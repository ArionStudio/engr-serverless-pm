import { composeSiteIcons } from "../browser/site-icons";
import { SiteIconsProvider } from "@/ui/features/site-icons/site-icons-provider.view";
import { composeDeviceManagement } from "../composition/device-management.capabilities";
import { composeVaultSettings } from "../composition/vault-settings.capabilities";
import { composeWorkspace } from "../composition/workspace.capabilities";
import { composeTagManagement } from "../composition/tag-management.capabilities";
import { composeFolderManagement } from "../composition/folder-management.capabilities";
import { composeSync } from "../composition/sync.capabilities";
import React, { useEffect, useState } from "react";
import { composeVaultSetup } from "../composition/vault-setup.capabilities";
import ReactDOM from "react-dom/client";
import { ThemeProvider, useTheme } from "@/ui/features/theme";
import "@/ui/styles/index.css";
import { OptionsView } from "@/ui/entrypoints/options/options.view";

import { assessSetupPassword } from "../composition/first-launch.capabilities";
import { emptyEntryDraft } from "@/ui/features/entries/entry-draft";
import {
  destinationForOptionsRoute,
  readOptionsRoute,
  readOptionsRouteMessage,
} from "@/ui/entrypoints/options/options-route";

export function Options() {
  const [siteIcons] = React.useState(composeSiteIcons);
  const [devices] = useState(composeDeviceManagement);
  const [vaultSettings] = useState(composeVaultSettings);
  const [workspace] = useState(composeWorkspace);
  const [tagManagement] = useState(composeTagManagement);
  const [folderManagement] = useState(composeFolderManagement);
  const [sync] = useState(composeSync);
  const [setup] = useState(composeVaultSetup);
  const [navigation, setNavigation] = useState(() => ({
    route: readOptionsRoute(window.location.hash),
    requestId: 0,
  }));
  useEffect(() => {
    const updateRoute = () => {
      const route = readOptionsRoute(window.location.hash);
      setNavigation((current) =>
        current.route === route
          ? current
          : { route, requestId: current.requestId + 1 },
      );
    };
    const receiveRoute = (message: unknown) => {
      const route = readOptionsRouteMessage(message);
      if (route)
        setNavigation((current) => ({
          route,
          requestId: current.requestId + 1,
        }));
    };
    window.addEventListener("hashchange", updateRoute);
    chrome.runtime.onMessage.addListener(receiveRoute);
    return () => {
      window.removeEventListener("hashchange", updateRoute);
      chrome.runtime.onMessage.removeListener(receiveRoute);
    };
  }, []);
  const activeRoute = navigation.route;
  const { preference, setTheme } = useTheme();
  return (
    <SiteIconsProvider capabilities={siteIcons}>
      <OptionsView
        devices={devices}
        vaultSettings={vaultSettings}
        workspace={workspace}
        tagManagement={tagManagement}
        folderManagement={folderManagement}
        setup={setup}
        sync={sync}
        preference={preference}
        onThemeChange={setTheme}
        assessPassword={assessSetupPassword}
        initialDestination={destinationForOptionsRoute(activeRoute)}
        routeRequestId={navigation.requestId}
        initialRecovery={activeRoute === "recover-access"}
        onExitRecovery={() => {
          window.location.hash = "entries";
          setNavigation((current) =>
            current.route === "entries"
              ? current
              : {
                  route: "entries",
                  requestId: current.requestId + 1,
                },
          );
        }}
        initialEntryDraft={
          activeRoute === "add-entry" ? emptyEntryDraft : undefined
        }
      />
    </SiteIconsProvider>
  );
}

const rootElement = document.getElementById("options");
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ThemeProvider>
        <Options />
      </ThemeProvider>
    </React.StrictMode>,
  );
}
