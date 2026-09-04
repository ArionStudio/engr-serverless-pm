import { resolve } from "node:path";
import { defineConfig } from "vite";

const outputDirectory = process.env.LFSPM_BIP39_BUNDLE_SMOKE_OUT_DIR;

if (outputDirectory === undefined || outputDirectory.length === 0) {
  throw new Error("BIP39 bundle smoke output directory is required.");
}

const workspaceRoot = resolve(__dirname, "../../..");

export default defineConfig({
  build: {
    emptyOutDir: true,
    minify: true,
    outDir: outputDirectory,
    rollupOptions: {
      input: resolve(__dirname, "bip39-bundle-smoke.entry.ts"),
      output: {
        entryFileNames: "bip39-smoke.js",
        format: "es",
        inlineDynamicImports: true,
      },
    },
  },
  resolve: {
    alias: {
      "@lfspm/core": resolve(workspaceRoot, "packages/core/src"),
    },
  },
});
