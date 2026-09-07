# Vault workspace preparation checklist

Status: requirements recovery and pre-implementation checklist, 2026-09-06.
No new screen layout is approved or implemented by this document. The preceding
[sync foundations](./sync-foundations.md) are implemented locally; the user
explicitly limited that pass to foundations.

## Recovered decisions

Source: T3 thread `b347c5f7-5efd-4190-911c-efee1d697ac8`, **Merge Main Changes
Locally**, project `/home/adrian/projects/private/engr-serverless-pm`. Relevant
messages run from 2026-09-04 23:26 to 2026-09-06 12:47 UTC. This is a synthesis
of user decisions, current docs and code checks, not a verbatim transcript.

| Evidence                                                                                                      | Requirement                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User, September 4 23:26 and 23:57                                                                             | Exact Mira/mauve/violet/Figtree/Hugeicons preset; full application on options, quick workflows in popup; system theme and saved override. Preserve subsequent contrast corrections. |
| User `cc59ef7c-c945-405e-a8d8-395fb23d6300`, September 5 15:31                                                | Every component and update remains discoverable in the gallery, with labeled variant choosers.                                                                                      |
| User `c02a677d-5eba-417a-8bd5-093da5c59c67`, September 5 09:02                                                | Explain non-obvious component use in the gallery.                                                                                                                                   |
| User `2762df67-b4db-4fbf-ac40-2a43cc3e102f`, September 5 15:21                                                | Schedule site icons with entries/settings integration according to the accepted favicon plan.                                                                                       |
| User `f9d266c5-8284-4000-a3c8-96580023c339`, September 5 18:06; `27d75b78-bf4e-4e22-9aa7-07556cedf322`, 18:56 | No subtitles or filler. Field guidance states requirements/purpose; additional explanations support safety and meaningful decisions.                                                |
| User, September 5 22:57 and 23:23                                                                             | Remove the global selected-control bottom stripe; improve focus borders. Preserve current shape-following focus outlines.                                                           |
| User, September 6 12:42                                                                                       | Sync foundations first. Vault and sync screens are separate subsequent work.                                                                                                        |

The existing [application map](../ui-ux/component-library.md) includes generators,
tags, settings, devices and recovery. Their place in the whole application does
not establish that every control must fit on the first vault screen. Likewise,
the richer table is implemented for review, but the user has not selected the
first screen's exact list/table or resizable layout.

## Before assembling screens

- [ ] Use `$frontend-router` for the actual UI work. Start from the existing
      library and [ownership inventory](../ui-ux/review-inventory.md), not fresh
      parallel components. Mobbin informs interactions; its previously reviewed
      screens are not the approved visual finish.
- [ ] Review the missing entries-owned `SiteIcon` presentation first. Reuse
      Avatar and register its loaded/loading/unavailable/failed states in P11.
- [ ] Establish the options and popup compositions. Options provides the full
      workspace; popup supports compact quick actions and an obvious options handoff.
      Keep the existing no-vault, locked and explicit multi-vault selection paths.
- [ ] Account for existing table search, tag filtering, sorting, column choices,
      pagination, row actions and stable selection. Pick controls for each shell
      deliberately. Preserve all supported gallery variants even where a product
      screen uses fewer controls. Selection review is not a bulk-delete workflow.
- [ ] Resolve the public read contracts needed for tag labels and local vault/sync
      summaries. Current search results expose numeric tag IDs; the UI must not read
      repositories to invent their labels or infer that a configured vault is synced.
- [ ] Define consistent edit initialization. Current ReadEntry returns metadata
      and its version; GetEntryPassword separately returns a password. The editor
      must not combine an older password with newer metadata/version during a race.
      Resolve this through a narrow core contract before wiring the form. The exact
      contract is implementation work, not a newly approved API in this checklist.

## Proposed first workspace and required behavior checks

- [ ] List/search with distinct loading, empty-vault, no-match, failure/retry and
      ready states. Show the actual website origin and login. Handle long values and
      narrow layouts without hiding actions or causing accidental activation.
- [ ] Details with website, login and available tag labels. Password reveal is
      deliberate and scoped to the selected entry; list/table rows remain password-free.
- [ ] Copy uses the composed clipboard workflow, reports the actual outcome and
      retains the existing owned-clear behavior. Never replace it with a UI timeout.
- [ ] Add/edit use actual login, URL, password and tag contracts. Include validation,
      pending, failure, success and cancel behavior; prevent duplicate submission.
      Preserve safe drafts on retry but clear secrets/reveal on success, cancel,
      lock or vault change. Password strength has no empty placeholder or reserved gap.
- [ ] Keep password generation and the explicit weak-password override in the
      entry-editing scope review. Username generation belongs to the documented tools
      inventory. Final placement is still a design choice; do not silently drop them.
- [ ] Edit/delete retain the entry version originally reviewed. A stale error
      requires reviewing current data, never automatically replacing the expected
      version and retrying. Delete confirmation identifies the entry and its consequence,
      begins with safe focus, and handles failure without pretending deletion succeeded.
- [ ] Show local save and remote upload outcomes separately. Preserve strict online
      writes for synchronized vaults, offline access where supported, pending-upload
      reconciliation, newer-remote review, credential failure and integrity failure.
      Read-only presentation must not claim successful sync from an unlocked status.
- [ ] Keep lock, vault selection and settings access reachable. Preserve the single
      device-local lock preference. It is a duration from unlock, not an inactivity timer.
- [ ] Handle cross-context changes, same-vault reactivation, popup closure, an
      already-open options page, switching entries/vaults and late asynchronous results.
      Invalidate old results and remove private display data when ownership changes.

Full sync configuration/credential-repair/review screens remain proposed follow-up
work. A workspace action must have a real recovery destination or an accurate
availability result. Do not ship a dead review/retry button merely to preserve
that proposed order. Disabling sync is destructive, not a pause toggle.

## Site-icon integration gate

Follow the [favicon plan](../ui-ux/favicon-review.md) at entries/settings
integration. Browser integration owns Chrome lookup and optional permission;
settings gets a device-local preference capability. No new core favicon service,
per-row use case, automatic website fetch or third-party icon proxy is planned.

- [ ] Permission grant, denial and revocation work in both contexts, with a local
      fallback and no permission prompt during row rendering.
- [ ] Validate URLs at the boundary and pass only the origin. Render approved
      images as decoration beside the real origin; never treat a logo as proof of identity.
- [ ] No plaintext site-to-icon index or secret-bearing URLs/logs/caches. Clear
      displayed data and pending UI work on lock or vault switch.
- [ ] Verify browser-level network behavior for known, unknown, stale and offline
      cache entries before making a no-website-request claim or enabling the feature.

## Review and completion gate

- [ ] Keep feature widgets in their owning slices; shells compose public APIs and
      inject narrow capabilities. Reuse one application graph per trusted context.
      No core policy in React and no assumption that a singleton spans browser contexts.
- [ ] Use copied display fields with the adopted TanStack Table. Do not introduce
      secret form caches, TanStack Form/Query, tRPC, virtualization or another state
      library merely to assemble these screens.
- [ ] No secrets or private search text in URLs, telemetry or general state stores.
      Test hostile names/URLs, explicit secret access, stale results and lock cleanup.
- [ ] Register every new/changed component, widget and screen using its real
      implementation. Cover named variants, sizes/layouts and separately labeled
      behavior states; update usage guidance and inventory in the same change.
- [ ] Keep components on `gallery.html` and complete screens on `screens.html`,
      with visible navigation and direct state choices. Gallery fixtures stay isolated
      from production vaults and excluded from the extension bundle.
- [ ] Check keyboard operation, accessible names/label activation, dialog focus
      and return focus, both themes, narrow widths, long content and changed contrast.
      Preserve current focus styling and avoid the removed bottom stripe.
- [ ] Run focused component/integration tests, then full affected package tests
      and both package type checks, extension lint/build, gallery build/inventory/variant checks,
      formatting and diff checks. Scope the full gates to the eventual code changes.
- [ ] Validate the actual unpacked Chrome extension, not only gallery pages:
      popup/options interaction, Figtree/16px body text, lock/clipboard lifecycle,
      stale work and error paths. Collect console, page and CDP Log warnings, including
      delayed preload warnings. Use managed validation servers and keep raw evidence
      in ignored local storage.

Autofill, device enrollment/revocation screens, complete disaster recovery and
broader settings remain tracked application work. Notes, custom titles, favorites,
folders and bulk mutations need product/core contracts before being presented as
working actions. This checklist does not silently add them to the next pass.
