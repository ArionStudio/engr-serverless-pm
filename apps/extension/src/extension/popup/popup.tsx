import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "@/ui/features/theme";
import "@/ui/styles/index.css";
import { PopupView } from "@/ui/entrypoints/popup/popup.view";

import { useVaultAvailability } from "@/ui/entrypoints/use-vault-availability";
import {
  readLocalVaultCount,
  openOptionsPage,
} from "../composition/first-launch.capabilities";

export function Popup() {
  const { availability, retry } = useVaultAvailability(readLocalVaultCount);
  return (
    <PopupView
      availability={availability}
      onRetry={retry}
      onOpenOptions={openOptionsPage}
    />
  );
}

const rootElement = document.getElementById("popup");
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ThemeProvider>
        <Popup />
      </ThemeProvider>
    </React.StrictMode>,
  );
}
