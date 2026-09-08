import { composeWorkspace } from "../composition/workspace.capabilities";
import { composeSync } from "../composition/sync.capabilities";
import React, { useState } from "react";
import { composeVaultSetup } from "../composition/vault-setup.capabilities";
import ReactDOM from "react-dom/client";
import { ThemeProvider, useTheme } from "@/ui/features/theme";
import "@/ui/styles/index.css";
import { OptionsView } from "@/ui/entrypoints/options/options.view";

import { assessSetupPassword } from "../composition/first-launch.capabilities";

export function Options() {
  const [workspace] = useState(composeWorkspace);
  const [sync] = useState(composeSync);
  const [setup] = useState(composeVaultSetup);
  const { preference, setTheme } = useTheme();
  return (
    <OptionsView
      workspace={workspace}
      setup={setup}
      sync={sync}
      preference={preference}
      onThemeChange={setTheme}
      assessPassword={assessSetupPassword}
    />
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
