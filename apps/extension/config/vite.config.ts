import { lstatSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

const workspaceRoot = resolve(__dirname, "../../..");
const coreSourceRoot = resolve(workspaceRoot, "packages/core/src");

function collectFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const filePath = join(directory, entry);
    const stats = lstatSync(filePath);

    if (stats.isSymbolicLink()) {
      return [];
    }

    if (stats.isDirectory()) {
      if (entry === "__tests__") {
        return [];
      }

      return collectFiles(filePath);
    }

    if (!stats.isFile()) {
      return [];
    }

    if (!entry.endsWith(".ts") || entry.endsWith(".test.ts")) {
      return [];
    }

    return [filePath];
  });
}

function watchWorkspaceCore(): Plugin {
  return {
    name: "watch-workspace-core",
    buildStart() {
      for (const filePath of collectFiles(coreSourceRoot)) {
        this.addWatchFile(filePath);
      }
    },
  };
}

export default defineConfig({
  plugins: [
    watchWorkspaceCore(),
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
    manifest: true,
    // Extension documents load local ES modules directly. Preload hints cause
    // Chrome cross-world resource warnings in the extension origin.
    modulePreload: false,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "..", "popup.html"),
        options: resolve(__dirname, "..", "options.html"),
        offscreen: resolve(__dirname, "..", "offscreen.html"),
        background: resolve(
          __dirname,
          "..",
          "src/extension/background/background.ts",
        ),
      },
      output: {
        entryFileNames: "[name].js",
        // Rollup helper names can begin with "_", which Chrome reserves.
        chunkFileNames: "chunk-[name].js",
        assetFileNames: "[name].[ext]",
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "..", "src"),
      "@lfspm/core": coreSourceRoot,
    },
  },
  optimizeDeps: {
    exclude: ["@lfspm/core"],
  },
});
