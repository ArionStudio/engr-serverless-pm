import React from "react";
import ReactDOM from "react-dom/client";
import { Options } from "@/ui/components/options";
import { ThemeProvider } from "@/ui/theme";
import "@/ui/styles/index.css";

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
