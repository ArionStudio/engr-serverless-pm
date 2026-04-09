import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "@/ui/features/theme";
import "@/ui/styles/index.css";
import { PopupView } from "@/ui/entrypoints/popup/popup.view";

const rootElement = document.getElementById("popup");
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ThemeProvider>
        <PopupView />
      </ThemeProvider>
    </React.StrictMode>,
  );
}
