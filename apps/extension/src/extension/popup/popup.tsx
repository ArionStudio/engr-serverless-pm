import { composePopupSync } from "../composition/popup-sync.capabilities";
import { composeVaultSettings } from "../composition/vault-settings.capabilities";
import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "@/ui/features/theme";
import "@/ui/styles/index.css";
import { PopupWorkspace } from "@/ui/entrypoints/popup/popup-workspace.view";
import { composeWorkspace } from "../composition/workspace.capabilities";
import { composeVaultSetup } from "../composition/vault-setup.capabilities";
import { openOptionsPage } from "../composition/first-launch.capabilities";

export function Popup() {
  const [sync] = React.useState(composePopupSync);
  const [settings] = React.useState(composeVaultSettings);
  const [workspace] = React.useState(composeWorkspace);
  const [setup] = React.useState(composeVaultSetup);
  return (
    <PopupWorkspace
      setup={setup}
      workspace={workspace}
      settings={settings}
      sync={sync}
      onOpenOptions={openOptionsPage}
    />
  );
}

const rootElement = document.getElementById("popup");
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <ThemeProvider>
        <Popup />
      </ThemeProvider>
    </React.StrictMode>,
  );
}
