import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "@/ui/features/theme";
import "@/ui/styles/index.css";
import { OptionsView } from "@/ui/entrypoints/options/options.view";

const rootElement = document.getElementById("options");
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ThemeProvider>
        <OptionsView />
      </ThemeProvider>
    </React.StrictMode>,
  );
}
