#!/bin/bash
# Build script that ignores lint-staged file arguments
tsc -b && vite build && cp public/manifest.json dist/ && cp public/icon.svg dist/
