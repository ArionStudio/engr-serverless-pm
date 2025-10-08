#!/bin/bash
# Build script that ignores lint-staged file arguments
tsc -b && vite --config ./config/vite.config.ts build && cp ./config/manifest.json dist/ && cp ./assets/icon.svg dist/
