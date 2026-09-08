# Vault workspace implementation and review batches

Build the options workspace and popup quick access on the existing component
library and composed core workflows. The original sync/setup checkout remains
untouched. This review worktree starts from a local snapshot of those changes.

## Batch order

1. Core read contracts: reuse the visible-vault projection for tags and location
   status; explicitly read password, metadata and version together for editing.
2. Entry presentations: details, editor tools, site-icon fallback, gallery states.
3. Options workspace: list/table, search/tags, add/edit/delete, secret actions,
   precise local/sync outcomes and session lifecycle.
4. Popup quick access and browser acceptance: existing-vault selection/unlock,
   search/copy, full-options handoff and lifecycle checks.

Batches depend on preceding batches. Review and commit a batch before popping
the next. Local checkpoint commits preserve the complete implementation as well
as named stashes. No remote branch or PR is created by this task.

## Required behavior

Use actual core operations. Passwords never enter table/list data. Edits and
deletions retain the reviewed entry version and do not retry stale writes
silently. Synchronized writes keep the current online-write guard. A pending
upload is distinct from a confirmed remote save; opening a configured vault is
not proof it is synchronized. Lock, navigation and context replacement clear
private displays and invalidate late results. Clipboard clearing remains owned
by the composed workflow. Every rendered addition and named variant is registered
in the gallery; appearance is reviewed in-browser, not through pixel audits.

Device enrollment, autofill, provider additions and disaster recovery remain
separate tasks. The workspace reuses supported entry fields rather than adding
notes, folders, favorites or bulk deletion without domain contracts.

## Implemented scope and limits

The options page opens the table after recovery verification or unlock. Entry
forms support tags already defined by the vault, password and username generation,
and an explicit weak-password override. The popup provides search across login,
website and tag labels, entry details, reveal, timed copy and an Options handoff.
Core read contracts return an isolated editor record or a password-free workspace
projection. The UI never reads vault repositories directly.

Entries use local site initials in the table, popup and details. The `SiteIcon`
family also exposes bundled-image, loading and failure states for review. Chrome
favicon lookup and its device-local setting remain gated by the accepted network
verification requirements in `docs/ui-ux/favicon-review.md`; this change adds no
favicon permission, automatic site requests, icon proxy or plaintext icon index.

A saved local mutation is described separately from an uploaded mutation. An
uncertain upload offers the existing Sync screen. Core still owns reconciliation,
credential repair and strict online writes. Changes in other extension contexts
invalidate revealed secrets and refresh display fields. Editor versions stay fixed until explicit reload. Deletion uses the version from
the complete details record last opened or revealed; automatic refreshes never
advance it. Notifications contain no
vault identifiers, entry metadata or passwords.

Review screens are available at `screens.html#workspace` and
`screens.html#popup`. The component gallery keeps the actual editor, details,
site-icon and workspace implementations in their existing entry/screen families.
Named axes and behavior scenarios remain separately selectable.

## Validation

The complete core and extension test suites, type checks, lint, production build,
and gallery inventory/build pass. The gallery covers 295 components/parts and
74 named variant axes.
Focused behavioral coverage includes duplicate-save prevention, retained versions
through refresh, late editor/reveal results after session changes or blur, pending
upload feedback, popup search/copy and incomplete-setup handoff.

An isolated Chrome profile exercises actual vault creation and three-word recovery
verification, add/reveal/hide, two options tabs editing the same entry, explicit
stale-draft reload, popup copy, cross-context lock/unlock and deletion. The clipboard
clear is checked after closing the secret view and locking through the popup.
Console, page-error and CDP Log collection includes the delayed clear interval.
The unpacked document uses Figtree Variable and a 16px body font. Gallery review covers dark desktop and light narrow layouts, keyboard entry opening, safe Cancel focus in deletion confirmation, and focus returning to workspace controls.

Live AWS connectivity and two physical devices still require the user's completed
S3 configuration. Core regression tests cover sync policy; this local acceptance
run does not claim a live bucket or physical-device test.
