import React from "react";
import ReactDOM from "react-dom/client";
import { Popup } from "./components/Popup";
import "./index.css";

const rootElement = document.getElementById("popup");
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <Popup />
    </React.StrictMode>
  );
}
