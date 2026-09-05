import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";

// This build has no extension entry points, manifest or runtime composition.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist-gallery",
    rollupOptions: {
      input: resolve(__dirname, "../gallery.html"),
    },
  },
  resolve: {
    alias: { "@": resolve(__dirname, "../src") },
  },
});
