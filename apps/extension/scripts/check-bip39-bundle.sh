#!/bin/bash
set -euo pipefail

bundle_output_directory="$(mktemp -d)"
trap 'rm -rf "${bundle_output_directory}"' EXIT

LFSPM_BIP39_BUNDLE_SMOKE_OUT_DIR="${bundle_output_directory}" \
  vite --config ./config/bip39-bundle-smoke.vite.config.ts build

bundle_file="${bundle_output_directory}/bip39-smoke.js"

if [[ ! -s "${bundle_file}" ]]; then
  echo "BIP39 browser bundle smoke check did not produce an entry bundle." >&2
  exit 1
fi

if ! grep -Fq "abandon" "${bundle_file}"; then
  echo "BIP39 browser bundle smoke check omitted the English wordlist." >&2
  exit 1
fi
