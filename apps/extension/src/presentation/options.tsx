import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { Options } from "./components/Options";

const rootElement = document.getElementById("options");
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <Options />
    </React.StrictMode>,
  );
}
