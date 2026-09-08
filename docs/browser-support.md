# Browser support and builds

LFSPM uses one source tree and produces separate unpacked builds for Chromium
and Firefox. The browser-specific boundary covers the manifest, background
runtime and clipboard access. UI, crypto, IndexedDB, vault operations and S3 sync
remain shared.

| Target   | Command                   | Unpacked output                |
| -------- | ------------------------- | ------------------------------ |
| Chromium | `pnpm ext:build:chromium` | `apps/extension/dist/`         |
| Firefox  | `pnpm ext:build:firefox`  | `apps/extension/dist-firefox/` |
| Both     | `pnpm ext:build:all`      | Both directories               |

`pnpm ext:build` remains an alias for the Chromium build.

## Load the Firefox build

1. Run `pnpm ext:build:firefox` from the repository root.
2. Open `about:debugging#/runtime/this-firefox` in Firefox.
3. Choose **Load Temporary Add-on**.
4. Select `apps/extension/dist-firefox/manifest.json`.

The temporary installation remains until Firefox restarts. A normal permanent
installation requires a package signed by Mozilla. Signing and distribution are
separate from this development build.

The Firefox manifest uses a non-persistent background document and does not ask
for Chrome's `offscreen` permission. Firefox background scripts have a DOM
environment, so clipboard reads and compare-before-clear operations use
`navigator.clipboard` with the declared `clipboardRead` and `clipboardWrite`
permissions. Chromium keeps its offscreen clipboard document because its
Manifest V3 background context is a service worker.

When sync is enabled, Firefox asks for access to the configured S3 host through
the same `optional_host_permissions` flow as Chromium. The Firefox manifest
declares transmission of authentication information because encrypted vault
contents and S3 credentials are handled by the user's chosen S3 service. No
telemetry or LFSPM-operated server is added.

## Current limits

- The Firefox build targets Firefox 140 or newer so Mozilla's built-in data
  collection consent is available.
- Development installation is temporary. The build has a stable Gecko add-on ID
  for storage identity and future signing, but Firefox still assigns a separate
  internal `moz-extension://` UUID per browser profile.
- S3 permission is granted separately in every browser profile. It is based on
  the S3 HTTPS host and does not depend on the internal Firefox UUID or bucket
  CORS origins.
- The automated build checks validate the Firefox manifest, bundle and
  browser-specific clipboard behavior. They do not establish completion of the
  real-Firefox workflow checklist below before distribution.
- Mozilla signing metadata is present, but no signed `.xpi` is produced.
- Website icons currently display local initials. Optional Chromium icons are
  introduced in the separate site-icon batch; Firefox/Zen keeps local initials.

## Verification checklist

In a temporary Firefox profile, verify creation, lock and unlock, recovery,
password copy followed by timed clearing, S3 permission request, initial upload,
and two-way sync. For cross-browser enrollment, use disposable vault data and
test Firefox-to-Chromium and Chromium-to-Firefox approval paths.

## Mozilla references

Checked September 7, 2026:

- [Manifest V3 background compatibility](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background)
- [Firefox background script environment](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Background_scripts)
- [Clipboard access in extensions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Interact_with_the_clipboard)
- [Optional host permissions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/optional_host_permissions)
- [Firefox-specific manifest settings](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings)
- [Firefox built-in data consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)
- [Temporary installation in Firefox](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/)
- [Signing and distribution](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/)
