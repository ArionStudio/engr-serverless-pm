#!/bin/bash
# Build script that ignores lint-staged file arguments
set -euo pipefail

tsc -b
bash ./scripts/check-bip39-bundle.sh
vite --config ./config/vite.config.ts build
node ./scripts/check-background-bundle.mjs

# Copy manifest and icon to dist root
cp ./config/manifest.json dist/
cp ./assets/icon.svg dist/
