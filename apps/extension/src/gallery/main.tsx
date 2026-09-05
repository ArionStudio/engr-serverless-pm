import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Gallery } from "./gallery.view";
import "@/ui/styles/index.css";

const root = document.getElementById("gallery");
if (!root) throw new Error("Component gallery root is missing");

createRoot(root).render(
  <StrictMode>
    <Gallery />
  </StrictMode>,
);
