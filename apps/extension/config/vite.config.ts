import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { resolve } from "path";
import tailwindcss from "@tailwindcss/vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    viteStaticCopy({
      targets: [
        { src: "config/manifest.json", dest: "." },
        { src: "assets/icon.svg", dest: "." },
      ],
    }),
  ],
  build: {
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "..", "popup.html"),
        options: resolve(__dirname, "..", "options.html"),
        background: resolve(
          __dirname,
          "..",
          "src/extension/background/background.ts",
        ),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name].[ext]",
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "..", "src"),
    },
  },
});
