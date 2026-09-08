import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir:
      process.env.LFSPM_BROWSER_TARGET === "firefox" ? "dist-firefox" : "dist",
    emptyOutDir: false,
    modulePreload: false,
    lib: {
      entry: resolve(__dirname, "../src/extension/content/login-content.ts"),
      name: "LfspmLoginContent",
      formats: ["iife"],
      fileName: () => "login-content.js",
    },
  },
});
