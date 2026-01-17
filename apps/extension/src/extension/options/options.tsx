import React from "react";
import ReactDOM from "react-dom/client";
import "@/ui/styles/index.css";
import { ThemeProvider, useTheme } from "@/ui/theme";
import { OptionsView } from "@/ui/views";

export function OptionsPage() {
  const { preference, setTheme, isLoading } = useTheme();

  return (
    <OptionsView
      theme={preference}
      onThemeChange={setTheme}
      isLoading={isLoading}
    />
  );
}

const rootElement = document.getElementById("options");
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ThemeProvider>
        <OptionsPage />
      </ThemeProvider>
    </React.StrictMode>,
  );
}
