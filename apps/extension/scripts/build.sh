#!/bin/bash
# Build script that ignores lint-staged file arguments
set -euo pipefail

tsc -b
vite --config ./config/vite.config.ts build

# Copy manifest and icon to dist root
cp ./config/manifest.json dist/
cp ./assets/icon.svg dist/

