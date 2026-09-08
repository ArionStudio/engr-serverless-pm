#!/bin/bash
# Positional arguments may contain filenames appended by lint-staged. Browser
# selection is explicit through LFSPM_BROWSER_TARGET instead.
set -euo pipefail

target="${LFSPM_BROWSER_TARGET:-chromium}"
case "$target" in
  chromium)
    distribution_directory="dist"
    manifest_path="./config/manifest.json"
    ;;
  firefox)
    distribution_directory="dist-firefox"
    manifest_path="./config/manifest.firefox.json"
    ;;
  *)
    echo "Unsupported browser target: $target" >&2
    exit 1
    ;;
esac

node ./scripts/gallery-api.cjs
tsc -b
bash ./scripts/check-bip39-bundle.sh
LFSPM_BROWSER_TARGET="$target" vite --config ./config/vite.config.ts build
LFSPM_BROWSER_TARGET="$target" vite --config ./config/vite.content.config.ts build
node ./scripts/check-background-bundle.mjs "$distribution_directory"

# Copy manifest and icon to dist root
cp "$manifest_path" "$distribution_directory/manifest.json"
cp ./assets/icon.svg "$distribution_directory/"
node ./scripts/check-extension-files.mjs "$distribution_directory"
