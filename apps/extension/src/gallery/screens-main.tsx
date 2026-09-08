import { ThemeProvider } from "@/ui/features/theme";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ScreenGallery } from "./screen-gallery.view";
import "@/ui/styles/index.css";
import "./review.css";

const root = document.getElementById("screens");
if (!root) throw new Error("Screen presentation root is missing");
createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <ScreenGallery />
    </ThemeProvider>
  </StrictMode>,
);
