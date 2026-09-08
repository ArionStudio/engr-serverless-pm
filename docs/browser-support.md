# Browser support and builds

## Current support

The current `pnpm ext:build` command produces a Chromium build in
`apps/extension/dist`. Firefox packaging and runtime support are not implemented.
S3 uses optional browser host permission instead of per-installation CORS origins.
The gallery includes the missing-permission state.

Load the existing unpacked build through the Chromium browser's extension
management page. For a future Firefox-compatible build, development installation
uses `about:debugging` → **This Firefox** → **Load Temporary Add-on**, selecting
its manifest. That installation lasts until Firefox restarts. Normal permanent
installation in Firefox requires a Mozilla-signed package, which can be privately
self-distributed without a public store listing.

CRX Installer is a third-party converter hosted on Mozilla Add-ons. Its listing
names Zen, Firefox Nightly, Developer Edition and LibreWolf, with extra requirements
for regular Firefox. Conversion has not been validated for LFSPM. Installing a
converted package does not establish that locking, clipboard clearing or sync
work. Do not present conversion as a supported installation method yet.
Mozilla's webextension-polyfill is a developer API wrapper, not a Chrome Store
installer or an implementation of every Chrome-only API.

## Proposed implementation

Maintain one source tree with two explicit build targets. These commands and
output directories are proposed, not available yet:

| Target   | Proposed command          | Proposed output                 |
| -------- | ------------------------- | ------------------------------- |
| Chromium | `pnpm ext:build:chromium` | `apps/extension/dist/chromium/` |
| Firefox  | `pnpm ext:build:firefox`  | `apps/extension/dist/firefox/`  |
| Both     | `pnpm ext:build:all`      | Both directories                |

1. Share UI, core use cases, crypto, IndexedDB and S3 logic. Generate each manifest
   from shared settings plus browser-specific settings. Keep the existing Chromium
   build command and installed folder working during this change.
2. Chromium retains its service worker and offscreen clipboard adapter. Firefox
   uses an extension background script/page and its own clipboard adapter,
   including scheduled compare-before-clear behavior. Select adapters at the
   composition root; do not spread browser checks through core or UI.
3. Audit shared extension APIs, session storage, alarms and messaging against each
   browser. Configure a stable Firefox add-on ID, minimum tested version, and
   accurate data-transmission declarations for signing. The add-on ID is distinct
   from Firefox's internal origin UUID.
4. Reuse the optional S3 host-permission adapter and grant access on each browser.
   Follow [browser storage access](aws/s3/README.md#browser-storage-access).
5. Validate each unpacked build in its actual browser: create/unlock/relock,
   restart/session handling, clipboard clearing, recovery, and S3 read/upload.
   Once enrollment UI is connected, test Chromium-to-Firefox enrollment and
   two-way sync. Use disposable vaults and controlled storage for regression runs.
6. Package Firefox for Mozilla signing after runtime validation. Store credentials
   for signing outside the repository; publishing/signing is a separate action.

## Sources

Checked September 6, 2026:

- [Mozilla background compatibility](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background#browser_support)
- [Firefox temporary installation](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/)
- [Mozilla signing and distribution](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/)
- [Firefox-specific manifest settings](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings)
- [CRX Installer listing](https://addons.mozilla.org/en-US/firefox/addon/crxinstaller/)
- [Mozilla webextension-polyfill](https://github.com/mozilla/webextension-polyfill)
