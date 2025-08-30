import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

function Options() {
  return (
    <div className="options-container">
      <h1>SPM Extension Settings</h1>
      <div className="settings-section">
        <h2>Cloud Storage</h2>
        <p>Configure your cloud storage provider</p>
      </div>
      <div className="settings-section">
        <h2>Security</h2>
        <p>Security and encryption settings</p>
      </div>
    </div>
  );
}

const rootElement = document.getElementById("options");
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <Options />
    </React.StrictMode>
  );
}
