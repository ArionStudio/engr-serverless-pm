# Website icon safety review

Reviewed 2026-09-05. The user accepted the implementation plan and its staging.
The original review below records the accepted plan. Implementation status is updated here.

## Current implementation

Batch 08 adds an optional, device-local website icon setting to Popup and Options.
It is off by default. Chromium requires both the saved preference and the optional
`favicon` permission. Firefox keeps initials and does not request that permission.

`extension/browser/site-icons.ts` owns permission and preference operations and
builds extension-local lookup URLs. The popup and options composition roots each
provide one stable capability instance. A shared Web Lock serializes preference
and permission mutations; enable rechecks the grant before saving the preference. `SiteIconsProvider` observes storage and
permission changes across contexts; `SiteIconSettings` exposes the explicit toggle.
Incomplete settings or permission cleanup is read from browser state and has a direct Retry cleanup action after reopening, even when the
preference is already off. Concurrent enables reuse an already committed enabled
preference rather than risking rollback of another context's successful change.
Failed settings reads offer Retry settings without repeating the permission change.
The entries-owned `SiteIcon` reuses `Avatar` and rejects remote image sources.
Only HTTP/HTTPS origins without credentials reach the lookup endpoint. Paths,
query strings and fragments are excluded. Only the preference is persisted.

The planned extension-level preference operation is implemented by the composed
capability's `setEnabled`, rather than a new core use case or port. Both manifests
already restrict extension images with `img-src 'self'`. This change adds no host,
history or tabs permission and no third-party image service.

## Batch 08 verification

On 2026-09-08, `docs/ui-ux/verification/site-icons.verify.cjs` loaded a disposable
unpacked extension in Chrome 152.0.7977.82. It confirmed default-off behavior,
origin-only lookup, cross-context preference changes, different cached and unknown
site icons, offline rendering, removal of icons and entry metadata on lock, and
no per-site icon index in browser preferences. Browser-wide NetLog recorded no
HTTP request or DNS lookup for the fixture sites during icon lookup. Page errors,
console warnings/errors and CDP log warnings/errors were empty. Raw results remain
in ignored `.local/site-icons-validation/`.

The verifier grants `favicon` through a temporary test manifest. It does not test
native permission dialogs. Unit tests cover granted/denied permission and external
revocation. Native consent, aged cache entries and Firefox runtime remain manual
acceptance checks; neither this capture nor the original source review proves
behavior for every browser version. Icons remain optional and off by default.

## Original plan and remaining acceptance checks

| Stage                             | When to implement                                                      | Owner and deliverable                                                                                                                                     | Completion evidence                                                                                                     |
| --------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Presentation                      | Next entries-component library work, before assembling entries screens | Entries-owned `SiteIcon`, reusing shared `Avatar`; extend P11 with bundled synthetic examples                                                             | Loaded, loading, unavailable and failed states; visible website label; fixed layout and contrast in both themes         |
| Browser capability and preference | When connecting the entries screens and device-local settings          | Browser integration under `extension/browser/`; extension-level `SetSiteIconPreferenceUseCase`; inject narrow capabilities from popup/options composition | Permission grant, denial and revocation; preference persistence and cross-context updates; validated origin-only lookup |
| Runtime acceptance                | Before enabling browser icons in the shipped extension                 | Integrate with authoritative session invalidation and run the verification checklist below                                                                | Browser-level network evidence for cache hits/misses and offline operation; lock/vault-switch cleanup; working fallback |

- [x] Add the P11 `SiteIcon` presentation and gallery fixtures.
- [x] Implement the extension browser capability and preference workflow at entries/settings integration.
- [x] Verify cached/unknown/offline lookups and lock cleanup in a real Chromium extension.
- [ ] Complete native permission-dialog, aged-cache and Firefox runtime checks.

This extends the existing P11 family and reuses B38; it does not claim a new
implemented catalog entry. Browser integration is not a prerequisite for the
component gallery or first-vault setup. Keep it scheduled with entries/settings
integration rather than adding unused services during the library phase.

Shared controls render props only. The entries feature owns icon presentation;
settings invokes the composed preference use case. Permission requests originate
from an explicit settings action, with no prompt during row rendering. The
workflow returns an explicit result and leaves fallbacks usable after denial.
Per-row URL construction does not need its own use case or service.

Keep stateful capability instances shared within each composition graph. Popup
and options have separate instances and observe permission/preference changes.
Persist only the device-local preference, never a plaintext site-to-icon index.
No new core vault use case, core favicon port, encrypted-entry schema or sync
operation is required. The implemented capability and provider are described above.

## Original recommendation

Use Chrome's extension favicon endpoint as the first implementation candidate,
with a local initials/globe fallback. Do not add automatic website requests or a
third-party favicon service. A recognizable logo for every saved site cannot be
guaranteed: some sites have no favicon, and imported sites may have no browser
cache entry.

The extension endpoint requires the `favicon` permission. Chrome documents a
permission warning when neither `tabs` nor host permissions are already granted.
At the original review, the manifest had `activeTab`, but no `tabs`, host, or
`favicon` permission. The recommendation was to prefer
an optional, device-local “Use icons already available in Chrome” setting with a
runtime permission request, after verifying that permission flow in Chrome.
Do not ask for all-site access or browsing-history access to obtain icons.
[Chrome favicon documentation](https://developer.chrome.com/docs/extensions/how-to/ui/favicons).

The reviewed Chromium implementation calls `GetRawFaviconForPageURL`, whose
contract reads the history backend's favicon database. A missing bitmap returns
a bundled default icon. This supports a browser-cache approach rather than
fetching the saved site. It is source evidence, not a network capture of our
extension or a guarantee about every Chrome version. Test cache hits, misses,
expired entries and offline behavior in supported Chrome versions before
promising “no new website requests.” Chrome can return a generic icon successfully,
so an image `onError` callback alone cannot detect every cache miss.
[Extension handler](https://raw.githubusercontent.com/chromium/chromium/main/chrome/browser/extensions/favicon/favicon_util.cc),
[favicon service contract](https://raw.githubusercontent.com/chromium/chromium/main/components/favicon/core/favicon_service.h).

## Options and exposure

| Approach                                 | What it exposes or requires                                                                                                    | Decision                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Bundled globe or initials                | No icon network request or new permission                                                                                      | Always available, including locked/unavailable states                   |
| Chrome `/_favicon/` endpoint             | Favicon permission; browser-managed cached data and generic fallback                                                           | Preferred candidate, verify in the real extension                       |
| Current tab `favIconUrl`                 | Temporary `activeTab` access after invocation can expose the URL; assigning that remote URL to an image can make a new request | Reading metadata is not equivalent to safely reusing cached image bytes |
| Site `/favicon.ico`                      | Site sees the requesting connection and timing; location may be wrong or redirect elsewhere                                    | Exclude automatic fetching from the initial design                      |
| Fetch page and parse `<link rel="icon">` | More requests, arbitrary icon origins, HTML parsing and redirect handling                                                      | Unnecessary for the initial design                                      |
| Google, DuckDuckGo or another icon proxy | Provider receives the requested domain and the client's connection metadata; can correlate a list of saved services            | Exclude from the initial design                                         |

The exposure assessment is a threat-model inference from the requested URL and
who receives the request. It does not allege that a particular provider sells
or retains the data. Cookies and referrers depend on the loading mechanism and
browser policy; neither CORS nor omitting cookies makes the destination or
request timing private. Cross-origin `fetch` and displaying a remote `<img>` are
different operations, so lack of host permissions alone is not an image-request
firewall. At the original review, the CSP had no `img-src` or `default-src` restriction.
The current manifests now restrict images to the extension origin.
[Chrome tab permissions](https://developer.chrome.com/docs/extensions/reference/api/tabs),
[Chrome cross-origin requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests).

## Repository-specific constraints at the original review

- `apps/extension/config/manifest.json`: no favicon permission, host permissions,
  content scripts or web-accessible resources. Keep the favicon endpoint private
  to popup/options; the documentation's content-script example is not needed.
- `packages/core/src/domain/entry/sanitized-entry-url.utils.ts`: normal writes
  allow HTTP/HTTPS and remove credentials, query and fragment, but retain the
  path and port. The `sanitizedUrl` schema itself only checks string length.
  Re-parse at the icon boundary, reject invalid schemes/credentials, and use
  `new URL(value).origin + '/'` as the lookup input. Do not send login paths or
  account identifiers. Host fallback can lose page-specific branding; that is
  acceptable for decoration, never for credential matching.
- `password-entry.mapper.ts` already supplies the display URL without the secret
  password. Icon rendering must use that display projection, not decrypt/read
  the full entry for its logo.
- `ui/components/primitives/avatar.tsx` can display an approved image and local
  fallback. It should not discover sites, request permissions or call Chrome.
- Keep Chrome URL construction and permission access under `extension/browser/`,
  composed at the popup/options entrypoint. The current `src/adapters` naming
  checks reserve adapter modules for core-port implementations; do not invent a
  core favicon port to fit that directory. The entries feature owns `SiteIcon`
  presentation. No tRPC endpoint or general-purpose fetch service is needed.

## Rendering and lifecycle

Treat logos as untrusted decoration. Display the actual website origin beside
entries; a bank logo does not prove that an entry belongs to that bank. Use a
fixed icon box, `object-fit: contain`, an empty alt when the adjacent text names
the site, and a neutral backing that works in both themes. Local initials must
meet text contrast requirements. Arbitrary brand colors cannot be guaranteed to
meet UI contrast, so never rely on a favicon alone to convey a state or action.

Accept only the extension-owned favicon endpoint or bundled assets in this
first design. Render an image, never inline fetched SVG/HTML, `object` or `iframe`.
SVG in image context has browser restrictions, so it is inaccurate to claim
that every SVG image executes scripts; avoiding arbitrary remote formats also
reduces parser and resource risks.
[SVG image restrictions](https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image).

Look up only visible entries after unlock. Stop pending UI work on lock and
vault switch, and remove displayed entry metadata. Do not persist a plaintext
site-to-icon index in localStorage, IndexedDB or logs. Reuse Chrome's cache
without promising that locking the vault erases browser history or browser
caches. Do not sync icons into the encrypted vault merely for decoration.

When implementing, consider an explicit `img-src 'self'` restriction for these
extension pages after checking all existing image uses. Add `blob:` only if the
approved implementation actually requires it. Do not broaden CSP, permissions
or web-accessible resources preemptively.

## Verification before adoption

1. Load a real MV3 build; test permission granted, declined and revoked in both
   popup and options. Confirm the icon action adds no `tabs`, history or all-host permission.
   Other features may already have independently authorized host access.
2. Capture browser-level network activity for known, unknown, stale and offline
   cache entries, including a saved URL never visited in that profile. Page-level
   DevTools events alone may miss requests made by browser services.
3. Check invalid URLs, HTTP/HTTPS, ports, private/intranet hosts and paths with
   identifiers. Confirm only the normalized lookup origin is passed to Chrome.
4. Check missing/generic/corrupt images, vault switching and locking during load.
   Inspect persisted application storage for unintended site metadata.
5. Verify origin labels, fallback initials, fixed layout and contrast in both
   themes. A failed icon lookup must never prevent opening an entry.

The original review performed no browser acceptance tests. The Batch 08 section
above records fresh results and their limits; unchecked acceptance items remain
explicit rather than being inferred from unit tests or the original review.
