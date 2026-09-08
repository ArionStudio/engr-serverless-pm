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
  const [devices] = useState(composeDeviceManagement);
  const [vaultSettings] = useState(composeVaultSettings);
  const [workspace] = useState(composeWorkspace);
  const [tagManagement] = useState(composeTagManagement);
  const [folderManagement] = useState(composeFolderManagement);
  const [sync] = useState(composeSync);
  const [setup] = useState(composeVaultSetup);
  const [route] = useState(() => readOptionsRoute(window.location.hash));
  const [activeRoute, setActiveRoute] = useState(route);
  useEffect(() => {
    const updateRoute = () =>
      setActiveRoute(readOptionsRoute(window.location.hash));
    const receiveRoute = (message: unknown) => {
      const next = readOptionsRouteMessage(message);
      if (next) setActiveRoute(next);
    };
    window.addEventListener("hashchange", updateRoute);
    chrome.runtime.onMessage.addListener(receiveRoute);
    return () => {
      window.removeEventListener("hashchange", updateRoute);
      chrome.runtime.onMessage.removeListener(receiveRoute);
    };
  }, []);
  const { preference, setTheme } = useTheme();
  return (
    <>
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
        initialRecovery={activeRoute === "recover-access"}
        onExitRecovery={() => {
          window.location.hash = "entries";
          setActiveRoute("entries");
        }}
        initialEntryDraft={
          activeRoute === "add-entry" ? emptyEntryDraft : undefined
        }
      />
    </>
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
