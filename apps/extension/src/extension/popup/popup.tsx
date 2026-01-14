import React from "react";
import ReactDOM from "react-dom/client";
import { Popup } from "@/ui/components/popup";
import "@/ui/styles/index.css";

const rootElement = document.getElementById("popup");
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <Popup />
    </React.StrictMode>,
  );
}
