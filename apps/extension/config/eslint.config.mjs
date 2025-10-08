import js from "@eslint/js";
import globals from "globals";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { defineConfig, globalIgnores } from "eslint/config";

const eslintConfig = defineConfig([
  // Global ignores
  globalIgnores(["node_modules/*", "dist/**/*"]),

  // Base configs
  {
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs["recommended-latest"],
      reactRefresh.configs.vite,
    ],
  },

  // Base ignores
  {
    ignores: [
      "**/dist",
      "**/node_modules",
      "**/vite.config.*.timestamp*",
      "**/vitest.config.*.timestamp*",
    ],
  },

  // Prettier config
  eslintConfigPrettier,

  // General file rules
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        chrome: "readonly",
      },
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      "react/react-in-jsx-scope": "off",
    },
  },

  // Allow shadcn components to export both components and variants
  {
    files: [
      "src/presentation/components/ui/**/*.{ts,tsx}",
      "src/components/ui/**/*.{ts,tsx}",
    ],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
]);

export default eslintConfig;
