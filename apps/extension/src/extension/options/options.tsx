import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider, useTheme } from "@/ui/features/theme";
import "@/ui/styles/index.css";
import { OptionsView } from "@/ui/entrypoints/options/options.view";

import { useVaultAvailability } from "@/ui/entrypoints/use-vault-availability";
import {
  readLocalVaultCount,
  assessSetupPassword,
} from "../composition/first-launch.capabilities";

export function Options() {
  const { preference, setTheme } = useTheme();
  const { availability, retry } = useVaultAvailability(readLocalVaultCount);
  return (
    <OptionsView
      preference={preference}
      onThemeChange={setTheme}
      availability={availability}
      onRetry={retry}
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
