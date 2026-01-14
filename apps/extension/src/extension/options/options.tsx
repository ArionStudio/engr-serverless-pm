import React from "react";
import ReactDOM from "react-dom/client";
import "@/ui/styles/index.css";
import { Options } from "@/ui/components/options";

const rootElement = document.getElementById("options");
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <Options />
    </React.StrictMode>,
  );
}
