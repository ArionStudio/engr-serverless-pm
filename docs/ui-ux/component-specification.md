# Component-library build specification

Status: all current catalog IDs have implemented gallery presentations as of
2026-09-08.
The [review inventory](./review-inventory.md) records actual ownership, import paths,
consolidations and integration limits. Visual approval and the complete acceptance
matrix below remain review gates, not implied by a successful build.

The user accepted the current component-library direction for now. The ongoing
catalog/variant requirements below apply to every later UI change; this acceptance
does not certify every variant or complete the remaining accessibility checks.

## Scope and completion boundary

Build and review the complete catalog below in the gallery before assembling
application screens. Batches order component dependencies, not product releases.
Setup is the first application flow to assemble after the library is ready.

The generated [catalog](../../apps/extension/src/gallery/catalog.ts) and
[component API inventory](../../apps/extension/src/gallery/component-api.generated.ts)
are the source of truth for current membership and variant axes. The catalog
includes base controls, presentation families, form compositions and application screen views.
The initial 20 controls grew by eight reuse-audit additions and ten further
review controls. A family can expose related parts without one file per name.
All entries belong to this library review. Setup, recovery, entries, organization, password tools, devices, sync and settings are integrated. PopupWorkspace uses composed production capabilities for website-login detection, capture and Fill. The gallery uses synthetic fixtures for those capabilities.

Use the exact [preset](./component-library.md#exact-visual-foundation), Base UI,
Figtree and Hugeicons. The [Mobbin board](./mobbin.md) documents interaction research,
not the desired visual finish. Develop a cohesive library in the chosen preset.

## Shared component contract

The following acceptance conditions apply to every catalog row. The row then adds
its specific API, variants, states and gallery evidence.

### APIs and ownership

- Base controls preserve the selected shadcn/Base UI composition and event APIs.
  Do not wrap every control in another pass-through abstraction.
- Custom components receive typed values, display state and callbacks. Descriptive
  callback names below are proposed presentation APIs, not new core commands.
  Reuse supported public core types when they fit; never import internal services.
- Separate `disabled`, validation errors and operation progress. A generic busy
  state must not replace domain outcomes such as sync pending or revoked access.
- No direct Chrome, Dexie, AWS, cryptography, clipboard or timer calls in library
  components. Gallery drivers inject synthetic outcomes. Feature controllers own
  later use-case invocation through the architecture's application boundary.
- Put base controls in `ui/components/primitives`. Put shared product presentation
  in `ui/components/forms`, `feedback` or `layout`. Feature-specific
  lists, reviews and forms stay inside their feature and export a small public API.
  The gallery may import that API without turning everything into global shared code.
- Composition families reuse their children. An EntrySelection is an EntryList
  composition; DestructiveConfirmation uses Alert Dialog; ActionFeedback uses
  Alert or status text. Do not duplicate their keyboard/focus implementations.

### Variants and sizing

Retain the generated Mira variant names and dimensions. Button's current checked-in
sizes are `xs` 20px, `sm` 24px, `default` 28px and `lg` 32px with corresponding icon
sizes. Those are an existing baseline, not a promise about newly generated output.
Capture the actual generated size/token table in the gallery after applying the preset.

Use the generated `lg` button size for prominent options actions and `default` for
compact toolbars. Inputs and select controls retain their generated base dimensions;
grouped controls align with one another. Do not invent a second theme or silently
shrink controls because a caller is popup. Content blocks are fluid width; forms
use a readable maximum width. `compact` and `expanded` below describe layout, not
different token systems. Components without a useful size variant expose none.

Keep normal explanatory text readable, with a proposed 14–16px body range and
roughly 65-character line length. Numeric values here are review targets for our
compositions, not a redefinition of the preset. Use semantic status tokens and
text/icons together; do not treat the emerald chart palette as a success convention.

Avoid selecting 20px buttons for primary actions. Validate target size/spacing
against [WCAG 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
Aim for 44px hit areas on major standalone actions where layout permits, while
preserving the preset's visual treatment. Enlarged hit areas must not overlap.

### Accessibility, states and secrets

- Interactive controls demonstrate rest, hover, keyboard focus, disabled and
  pressed/selected states where applicable. Stateful components also demonstrate
  their row's loading/error/empty cases. Static text does not need fake hover states.
- Use native semantics or Base UI behavior, associated labels/descriptions/errors,
  visible focus and names for icon actions. Tooltips are supplementary, never the
  only label or location of essential safety information.
- Announce operation results without repeating messages on every render. Use an
  assertive alert only when interruption is appropriate. Avoid moving focus on
  every keystroke; focus errors after submission or meaningful navigation.
- Test both themes, keyboard-only use, zoom/reflow, long content and reduced motion.
  Aim for WCAG AA text and non-text contrast; demonstrate results in the gallery
  review rather than declaring conformance from the component package alone.
- Focus uses one solid 1px violet outline, with a 1px gap and the control's
  existing corner radius. Grouped inputs and setup choice cards outline their
  enclosing shape; attached buttons have an inset outline. Avoid stacking a
  translucent ring on top. Forced-colors mode uses the system Highlight color.
- Password entry fields use normal password-input masking. Masking is not a memory
  or DOM security boundary. Concealed recovery/secret displays omit the secret
  text from rendered content; revealing is explicit.
- Secret values and callback arguments never go into analytics, URLs, persistent
  presentation state or gallery event logs. An event log may record action names
  only. The gallery uses obviously synthetic values and no connected vault.

## Base controls

Source for B01–B20 is the shadcn **Base UI** component with the corresponding name.
Keep its public parts rather than creating all-purpose controls. See
[the source register](./references.md#r12-component-library-specification).

| ID  | Component and purpose                                                                                                  | Variants / states beyond the shared contract                                                                       | Required gallery evidence                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| B01 | Button: primary, secondary, destructive, navigation and icon actions. Native/Base UI props plus existing CVA variants. | `default`, `outline`, `secondary`, `ghost`, `destructive`, `link`; generated sizes; busy composition with Spinner. | Every variant and size, long label, named icon button, busy label without width jump, duplicate action suppressed by driver.       |
| B02 | Field: labels, descriptions, errors, field groups and legends.                                                         | Vertical/horizontal grouping where supported; optional description; invalid/disabled.                              | Label activates control, IDs are unique with two forms mounted, error is announced, long help wraps.                               |
| B03 | Input: ordinary text, URL and numeric values.                                                                          | Empty/filled/invalid/read-only/disabled; appropriate type and autocomplete intent supplied by caller.              | Keyboard editing, paste, long value, no value lost on validation.                                                                  |
| B04 | Input Group: input with leading/trailing text or actions.                                                              | One or two addons; reveal/clear action; pending addon.                                                             | Focus order follows meaning; addons do not cover text or shrink the editing area excessively.                                      |
| B05 | Textarea: multiline enrollment data and recovery input.                                                                | Empty/filled/read-only/invalid; resizable within its container.                                                    | Long pasted text wraps or scrolls inside control; no HTML rendering or parser side effect.                                         |
| B06 | Native Select: fixed lock durations and small choice sets.                                                             | Placeholder/selected/disabled/invalid.                                                                             | Keyboard selection and long labels; controlled value remains stable after rerender.                                                |
| B07 | Checkbox: generator flags and multi-selection.                                                                         | Checked/unchecked/indeterminate/invalid.                                                                           | Clickable label, Space toggle, group description and disabled choices. Recovery completion does not default to a checkbox.         |
| B08 | Radio Group: theme and explicit local/remote choices.                                                                  | Inline/stacked layouts; selected/invalid/disabled option.                                                          | Arrow-key behavior, group label and associated descriptions.                                                                       |
| B09 | Slider: generator length adjustment alongside numeric Input.                                                           | Single value only; min/max/step; disabled.                                                                         | Keyboard and numeric-field parity; visible value and label. No slider-only precise entry.                                          |
| B10 | Alert: persistent safety information or actionable errors.                                                             | Default/destructive base styling; semantic info/warning/success copy composed when needed.                         | Long message, retry action, icon plus text; ordinary help does not announce as an urgent error.                                    |
| B11 | Badge: compact text status and tag labels.                                                                             | Generated variants; text/optional icon.                                                                            | Long label, adjacent statuses, no color-only meaning; noninteractive unless explicitly composed as a control.                      |
| B12 | Spinner: indeterminate progress.                                                                                       | Generated icon sizes and inline placement.                                                                         | Text alternative, reduced motion, no invented completion percentage.                                                               |
| B13 | Skeleton: loading of non-secret list/detail structure.                                                                 | Row/text/block composition; no fixed fake content.                                                                 | Stable layout, one loading announcement, decorative shapes hidden from assistive technology.                                       |
| B14 | Accordion: optional detailed help.                                                                                     | Single/multiple expanded sections; disabled section.                                                               | Keyboard operation and readable long content; core consequences remain outside collapsed sections.                                 |
| B15 | Tooltip: short supplementary explanations for compact actions.                                                         | Placement variants; pointer/focus opening.                                                                         | Escape dismissal, no clipped popup edge, trigger has its own accessible name; no secrets in tooltip.                               |
| B16 | Dropdown Menu: secondary entry/vault actions.                                                                          | Normal/destructive/disabled item, separator and group.                                                             | Arrow keys, Escape and focus return; portaled content stays within browser viewport. No nested menu planned.                       |
| B17 | Alert Dialog: deliberate destructive confirmation.                                                                     | Open/closed, submitting, failed confirmation.                                                                      | Focus containment/return; safe initial focus; consequence and explicit action label. No close that falsely cancels committed work. |
| B18 | Separator: distinct groups of controls or content.                                                                     | Horizontal/vertical; decorative by default.                                                                        | Correct orientation where semantic, no redundant announcements.                                                                    |
| B19 | Dialog: bounded tools or non-destructive detail.                                                                       | Open/closed, short/scrolling content.                                                                              | Title/description, close action, focus handling and usable small viewport. No stacked dialogs.                                     |
| B20 | Tabs: password/username generator views.                                                                               | Horizontal list; active/inactive/disabled tab.                                                                     | Associated panels, arrow-key focus and no unexpectedly submitted form on selection. Not the application's route navigation.        |

The [full shadcn reuse audit](./shadcn-reuse-audit.md) supersedes the earlier
blanket exclusion of Combobox, Sidebar and Sheet. Generate Empty, Item, Card,
Combobox, Button Group, Attachment, Sidebar and Sheet for the next gallery batch.
These eight are now CLI-generated and available in the review workspace.
The audit assesses every official catalog entry and records conditional uses of
other controls. The additional components retain their upstream names in this review batch;
new B IDs are not yet assigned. Keep existing IDs stable when expanding the catalog.

## Expanded base controls

| ID  | Control      | Review use           |
| --- | ------------ | -------------------- |
| B21 | Empty        | empty content        |
| B22 | Item         | metadata rows        |
| B23 | Card         | grouped content      |
| B24 | Combobox     | vault/tag selection  |
| B25 | Button Group | related actions      |
| B26 | Attachment   | file metadata        |
| B27 | Sidebar      | gallery navigation   |
| B28 | Sheet        | secondary details    |
| B29 | Table        | metadata table       |
| B30 | Pagination   | page navigation      |
| B31 | Switch       | immediate preference |
| B32 | Popover      | anchored preference  |
| B33 | Toast        | generic notification |
| B34 | Progress     | operation progress   |
| B35 | Toggle Group | presentation choice  |
| B36 | Resizable    | split panes          |
| B37 | Kbd          | keyboard hints       |
| B38 | Avatar       | local initials       |

## Product components

Product families compose the generated controls, the additional sources mapped in
the [reuse audit](./shadcn-reuse-audit.md#mapping-every-product-family), and semantic
HTML. Reuse upstream compositions before writing product-specific presentation.
The state list and gallery evidence in each row supplement the shared contract.
All widths are fluid unless the row describes an alternate layout.

### Structure, help and access

| ID  | Public family / purpose and proposed data contract                                                                | Variants / states                                                     | Required gallery evidence                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| P01 | StepNavigation: ordered `{id, label, state}` items, current ID, allowed navigation callback.                      | Current/completed/upcoming/error; horizontal or stacked by width.     | Long titles and keyboard navigation; only permitted steps are links; no claim a step flag authorizes access.             |
| P02 | SetupLayout: heading, introduction, step slot, help slot, content and action slots.                               | With/without help; wide two-column or stacked.                        | Placeholder content at each length, focus not obscured by actions; no router or form submission inside layout.           |
| P03 | SettingsSection: heading, description, content, optional action/status slots.                                     | Normal/destructive section; stacked/narrow presentation.              | Several sections with valid heading order; no nested decorative cards.                                                   |
| P04 | SafetyHelp: essential text plus optional titled detail sections.                                                  | Inline/alongside; expanded/collapsed details.                         | Consequences visible before expansion; no tooltip-only explanation; long safety text in both themes.                     |
| P05 | PasswordField: value/change, label, reveal state/change, description, error and input attributes.                 | New/current/confirmation intent; concealed/revealed/invalid/disabled. | Separate reveal state for two fields; preserve caret and value, named reveal action; driver clearing resets visibility.  |
| P06 | PasswordStrengthFeedback: supplied score `0..4` or not-yet-scored state, pending flag.                            | Five scores; unscored/scoring/unavailable.                            | Text identifies score without character-class claims; no guessing success while a result is pending.                     |
| P07 | LockDurationField: supplied allowed values, current duration/change, helper copy and save state.                  | Editable/read-only/error; default example 600000 ms.                  | All five core durations; explicit “this device” scope; timer wording supplied by caller rather than assuming inactivity. |
| P08 | ThemeControl: `system/light/dark`, change callback and resolved theme description. Reuse existing theme behavior. | Three choices, active state, compact/expanded labels.                 | System choice remains selected when resolved appearance changes; both themes visible in fixtures.                        |
| P09 | VaultPicker: non-secret descriptors, selected ID/change, loading/error and optional create/connect callbacks.     | Single/multiple/empty/loading/error.                                  | Duplicate names remain distinguishable, long names wrap, keyboard selection; never receives keys or a plaintext vault.   |

### Entries, actions and navigation

Search supports plain terms and field prefixes: `@` login, `#` tag, `/` folder,
and `:` website. Prefixes apply only at the start of a term; email addresses and
full URLs remain literal. Terms combine with AND, with case-insensitive substring
matching within the chosen field. Double quotes group multiword values; incomplete
quotes and empty prefixes remain editable without a syntax error. Suggestions
insert quoted values, and removable chips name the active fields. Its width
follows the container; use the gallery canvas chooser to review narrow and wide
layouts. No separate compact/expanded API is required.

| ID  | Public family / purpose and proposed data contract                                                                                             | Variants / states                                                                                         | Required gallery evidence                                                                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P10 | SearchField: query/change, submit/clear, searching state and result summary.                                                                   | Empty/filled/searching; responsive width.                                                                 | Clear retains focus, IME composition is not prematurely submitted, query text is not echoed into unsafe markup.                                                                           |
| P11 | EntryRow, EntryList, EntrySelection, EntryTable and SiteIcon: visible entry fields, selected ID and open/select/action callbacks.              | Browse/single-select; empty/loading/error; compact/expanded rows; icon loaded/loading/unavailable/failed. | Long login/URL, no nested interactive targets, no passwords in list props; website Fill uses the composed browser-login capability; non-initial icon states use bundled gallery fixtures. |
| P12 | DetailField: label, visible value, optional safe link and action slot.                                                                         | Plain/link/missing/multiline.                                                                             | Long URL and missing value; disallowed link schemes are inert through the approved URL boundary. No arbitrary HTML.                                                                       |
| P13 | SecretField: concealed state or supplied revealed value, reveal/hide intent and operation status.                                              | Concealed/revealing/revealed/error/disabled.                                                              | Concealed fixture has no secret DOM text; stale reveal result discarded by driver after reset; no silent reveal on copy.                                                                  |
| P14 | CopyAction: label, requested action callback, pending/success/failure display, optional cleanup explanation.                                   | Text/icon button; idle/copying/copied/failed.                                                             | Repeated request handling and denied copy; event log shows no payload; success never promises clipboard-history erasure.                                                                  |
| P15 | EmptyState, including EmptyVault: heading, explanation and optional primary/secondary actions.                                                 | No vault/empty vault/no results/unavailable; compact/expanded.                                            | Clear first-entry action, reset-search alternative and no false success decoration. Context chooses copy, not the component.                                                              |
| P26 | ActionFeedback: explicit status, user-facing message and optional retry callback.                                                              | Idle/pending/success/error; inline or block.                                                              | Persistent actionable error, announcement once, retry without losing surrounding inputs; raw exceptions never displayed.                                                                  |
| P27 | TagSelection: supplied tag options with IDs, labels and visual metadata, selected IDs/change, availability/error and optional create callback. | None/some selected/loading/unavailable/at limit; compact/wrapped.                                         | Long labels, grouped tag visuals, inline creation, remove action with a name and selection limits supplied by contract; no numeric-ID entry UI.                                           |
| P28 | AppNavigation and VaultToolbar: allowed navigation items, current route, vault identity, lock/open-options callbacks and status slots.         | Compact popup toolbar / expanded options navigation.                                                      | Current location announced, long labels, unavailable actions explained, keyboard reachability; callbacks contain no secret route data.                                                    |
| P29 | GuidancePanel: title, rich body, optional links and captioned attachments.                                                                     | info / warning.                                                                                           | Persistent note semantics; icon and border distinguish severity as well as color. Long text, grouped facts, links and screenshots are reviewable in the gallery.                          |
| P30 | TagMarker, TagPill, TagGroupHeading and TagVisualPicker: tag group, color, shade, name and icon presentation.                                  | Pill sizes and editable visual picker.                                                                    | Color is paired with text/icon meaning; every group, named color and shade is selectable in the gallery.                                                                                  |
| P31 | FolderTree, FolderPicker, FolderEditor, FolderCount and MoveFolderDialog: one-folder assignment and hierarchical management.                   | Read/select/create/edit/move; empty and deep hierarchy.                                                   | Uncategorized remains permanent, move choices prevent cycles, and bundled suggestions do not create folders until submission.                                                             |

### Recovery

| ID  | Public family / purpose and proposed data contract                                                                                                                 | Variants / states                                                                   | Required gallery evidence                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P16 | RecoveryPhraseGrid: concealed state or ordered 24 words, reveal/hide callback and description.                                                                     | Concealed/revealed; responsive columns.                                             | Numbers 1–24 retain DOM/reading order, long words fit, conceal removes text; fixtures are explicitly nonfunctional demo data.                                                       |
| P17 | RecoveryExportChoices and RecoveryGuide: supported methods, method descriptions, per-method state/action; guide receives identity, ordered words and instructions. | PDF/TXT/print/copy/manual; idle/pending/failed/requested. Print-ready guide layout. | Each choice has consequence copy; local synthetic guide preview; failed download leaves alternatives. UI does not assert that a file dialog or print request proves a saved backup. |
| P18 | RecoveryWordInput: phrase draft/change and supplied validation errors, with one field or 24 positional fields sharing the same value model.                        | Paste/edit/invalid/disabled; full phrase or numbered editing.                       | Paste a whole demo phrase, fix one word, keyboard traversal; no autocorrect/spellcheck or logging. Canonical validation stays outside control.                                      |
| P19 | RecoveryVerification: three supplied distinct positions, answers/change, field errors, submit and review callbacks.                                                | Empty/partial/checking/incorrect/complete.                                          | Positions stay stable on retry, labels say which word, paste allowed, review action available; component receives no expected answers.                                              |

For P17, the presentation and printable template belong in the library. Actual PDF
generation, file serialization, clipboard cleanup and browser permissions belong
to later application/adapters work. “Requested”, “saved a copy” and “verified” are
separate concepts. P18 is not a 24-digit OTP input. P19 performs a spot-check and
does not promise that all 24 words were recorded correctly.

### Generators, sync and devices

| ID  | Public family / purpose and proposed data contract                                                                                                          | Variants / states                                                                                       | Required gallery evidence                                                                                                                                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P20 | GeneratorControls and GeneratedValue: supplied password/username settings, change/generate/use callbacks, optional result and errors.                       | Password/username mode; ungenerated/generating/generated/invalid.                                       | Numeric length + slider parity, checkbox flags, impossible-combination error; synthetic result can be accepted or copied; no random generation in the control.                                            |
| P21 | SyncStatus: explicit display state, supplied detail and available actions.                                                                                  | Unconfigured/checking/uploading/complete/pending/existing-vault/target-occupied/review-required/failed. | “Pending” remains distinct from complete. An occupied S3 path names the exact object key and offers prefix editing without replacing the object. Retry is shown only when the caller permits.             |
| P22 | ComparisonRow, ResolutionSelector, ReviewSummary and SyncReview: safe visible local/remote items, allowed choices, selected resolutions and apply callback. | Entry/deleted/missing side; remote-ahead/remote-only; loading/reviewing/applying/stale/error.           | Local/remote labels survive narrow layout; password differences use a changed indicator, not values; unknown/broken/concurrent cases cannot be “merged” by UI.                                            |
| P23 | DeviceSummary: supplied non-secret identity/name, current-device indication, displayed state and allowed action callbacks.                                  | Current/other/revoked/unavailable; row/detail.                                                          | Long names and identifiers, consequences of revocation, action pending/error; no private keys or invented expiry-based trust.                                                                             |
| P24 | TransferInput and TransferOutput: text/file selection callbacks, artifact description, safe metadata, explicit export/copy intent and validation state.     | Request/response presentation; empty/selected/validating/invalid/ready.                                 | File selection has keyboard alternative; wrong/large file error; inert text preview; artifact labels do not imply trust before core verification. Sensitive artifact content never appears in event logs. |
| P25 | DestructiveConfirmation: action name, affected identity, consequence text, supplied acknowledgment requirement if any, confirm/cancel and progress.         | Entry removal/local vault deletion/sync disable/device revocation; idle/pending/error.                  | Distinct local/cloud/device consequences, safe initial focus and retry; backing out before confirmation differs from attempting to cancel a committed operation.                                          |

P20 password settings follow the current command: length, uppercase, lowercase,
numbers, special, minNumbers, minSpecial and avoidAmbiguousCharacters. Username
settings are capitalize/includeNumber. Limits/defaults come from the owning core
schema at integration time; the gallery can exercise boundary inputs without
claiming they pass policy. There is no username word-count or separator feature.

P22 supports only supplied `use_local` / `use_remote` resolutions from the current
review contract. It does not implement arbitrary concurrent-branch merging. P23
and P27 receive production read results through injected capabilities.
P24 consumes artifacts through callbacks; it does not parse trust records or
replace the enrollment protocol with a recovery-phrase import.

## Application screen compositions

| ID  | Composition                      | Current boundary                                                                                                                                                                                    |
| --- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S01 | PopupView and PopupWorkspace     | Vault access, entries, generators, settings and sync status are connected. Website-login detection, capture and Fill use composed production capabilities; gallery examples use synthetic fixtures. |
| S02 | OptionsView and VaultApplication | Setup, recovery, entries, password tools, devices, organization, sync and settings are connected through composed capabilities.                                                                     |
| S03 | SyncPage and SyncManagement      | Setup, access testing, review, repair, disable and credential-revocation recovery use injected sync capabilities.                                                                                   |
| S04 | S3SetupGuide                     | Guided AWS setup and browser storage permission states feed the real credential form without contacting AWS from the gallery.                                                                       |
| S05 | OrganizationManagementView       | Folder and tag management use their actual feature components and injected core-backed capabilities.                                                                                                |

## Reusable form compositions

Forms are controlled presentations with typed drafts/change, field errors,
submission state, submit/cancel callbacks and caller-supplied explanatory copy.
They reuse the families above. Their owners remain feature slices; they are
reviewed in isolation with synthetic submissions before screen assembly.

Shared variants: expanded options layout and compact layout only where specified.
Every form demonstrates empty, filled, invalid, submitting, failed and completed
driver states. Return success/error through injected display props; forms do not
call use cases. Secret fields clear/reset when their owner changes or ends the operation.

| ID  | Form and fields                                                                           | Components / size                                         | Additional gallery acceptance                                                                                                                                                                       |
| --- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F01 | UnlockForm: selected vault, master password, lock duration.                               | P05/P07/P09/P26; compact and expanded.                    | Wrong password, missing vault, locked status, busy submission, no automatic retry on rerender.                                                                                                      |
| F02 | EntryForm: login, URL, optional password, folder and selected tag IDs.                    | P05/P06/P20/P27/P26; compact and expanded add/edit modes. | Preserve values on failure, distinguish existing concealed password from new input, explicit weak-password override when supplied by owner; explicit passwordless confirmation; no titles or notes. |
| F03 | PasswordCreationForm: new password and confirmation.                                      | P05/P06/P04/P26; expanded.                                | Independent reveal, mismatch, strength pending/unavailable, score-4 acceptance fixture; no persistence on Back.                                                                                     |
| F04 | PasswordChangeForm: current password, new password and confirmation.                      | P05/P06/P04/P26; expanded.                                | Explain current-device scope; wrong-current-password and locked-session failures; success clears all three values.                                                                                  |
| F05 | CredentialForm: bucket, region, prefix, access-key ID and secret-access key.              | B02/B03/P05/P04/P26; expanded.                            | Secret concealment, invalid config and denied provider access; distinguish testing from configuring/uploading. No arbitrary endpoint/session-token fields unsupported by current adapter.           |
| F06 | LocalRecoveryForm: local vault selection, recovery phrase, new password and confirmation. | P09/P18/P05/P06/P04/P26; expanded.                        | Missing local data and invalid phrase; explain words-only limitations; successful synthetic outcome hands off to replacement-word presentation through a callback.                                  |
| F07 | DeviceSettingsForm: suggested editable name and local lock duration.                      | B02/B03/P07/P04/P26; expanded.                            | Neutral name fallback, long name, local-only scope, save failure with values retained. Timing semantics are caller-supplied and remain an integration decision.                                     |

P02 with F03 or F07 is a valid gallery composition example, not a connected setup
screen. There is no multi-page router, active vault, real export or cloud operation
in these examples. Forms do not add new password policy or treat a checkbox as
authorization. F02 uses `ReadEntryForEditingUseCase` to load a password and its entry version
together. Workspace list reads remain password-free, and updates pass the
captured version to core for stale-write rejection.

## Coverage of the earlier inventory

| Inventory area                           | Catalog coverage                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| First launch and setup                   | P01–P04, P07, P15–P19, P28; F03/F07                                                                     |
| Vault selection/unlock/lock              | P05/P07/P09/P26/P28; F01                                                                                |
| Entry browsing/details/editing/removal   | P10–P15/P25/P27; F02                                                                                    |
| Password/username generation             | B07/B09/B20; P20                                                                                        |
| Sync configuration/status/review/disable | P21/P22/P25/P26; F05                                                                                    |
| Device enrollment/revocation             | P01/P04/P23–P26; F03/F07 as applicable                                                                  |
| Local access recovery                    | P16–P19; F06                                                                                            |
| Theme/security settings                  | P03/P07/P08/P25; F04/F07                                                                                |
| Website login selection and Fill         | P11/P26; production uses the composed browser-login capability; gallery examples use synthetic fixtures |

This covers the planned UI without expanding core scope. General vault-import,
disaster-recovery archive, QR transfer, tag CRUD and arbitrary sync merging are
not silently added by the component specification.

## Gallery specification

Every example includes a short visible explanation of when to use it. For
non-obvious or overlapping controls, name a concrete vault use and distinguish
the nearby alternatives. Keep this guidance in the gallery, separate from
product UI copy. The catalog-typed `usage.ts` mapping covers every registered ID.

Create one development-only gallery with sections matching B, P and F IDs. Each
entry shows its purpose, actual import path, dependency components, variants,
states and remaining integration limitations. The review inventory marks every ID
`implemented for review`; validation evidence and visual approval are separate.

Every entry gets an interactive default example and explicit fixtures for its
listed states. Fixtures can use a small controllable async driver; no need for a
mock server or another state package. An action log records names/counts only.
Provide reset controls that clear secret fixtures and reveal state together.

Review sizes at 480px popup width and 768px/1280px options widths, plus 320px reflow
and 200% zoom. These are test widths, not locked product dimensions. Both themes
and actual system-theme selection are testable. Use long strings and many items
to expose overflow. Overlay examples near each edge reveal clipping/focus issues.

For P17 include a synthetic print layout review with page breaks and all 24 positions.
Clearly identify it as demonstration data that cannot recover a vault. The live setup supports TXT, browser print/Save as PDF, and copy; extension
validation is recorded in the setup flow. A dedicated PDF renderer is not implemented.

Do not use third-party screenshots as fixtures or copy their branding. Components
use Mira tokens and Hugeicons. The gallery is excluded from the production build
and does not expose a route in the shipped extension. Its build/review method uses
the repository toolchain; new tools still require dependency approval.

## Build checklist and dependency order

### Ongoing catalog and variant coverage

The gallery must grow with the application under
[UI-006](../standards/react-and-ui.md#ui-006-keep-the-component-gallery-current).
The generated catalog and component API inventory record current families,
exported components, compound parts and variant axes. ThemeProvider is documented
as a nonvisual runtime provider. Five current screen views are registered with
the same source-derived coverage checks.

Completed gallery coverage follow-up:

- [x] Audit rendered component exports against gallery membership. Give every
      component a discoverable entry or explicit named membership in a compound
      family. Record nonvisual-only modules separately; do not generate meaningless
      specimens for hooks/providers.
- [x] Add consistent labeled variant, size and layout choosers for the supported
      component APIs, with current selections visible and behavior states separate.
      Known gaps include Button size selection, Avatar sizes and Tabs' line variant.
      Inspect the rest of the source APIs rather than treating these examples as
      the full missing-variant list.
- [x] Add a coverage check that detects unregistered rendered exports and missing
      declared variant options. Derive expectations from component APIs where
      feasible; do not merely compare two manually maintained lists. A browser
      pass must also prove each registered choice renders the actual component.
- [x] Validate the affected examples in both themes and relevant widths, including
      contrast, keyboard interaction and reset behavior. Record remaining limits.
      The [coverage evidence](./review-inventory.md#living-gallery-coverage-follow-up)
      records the completed browser matrix and test results.

Every later component change includes the corresponding gallery update. The
catalog count and navigation should derive from registered entries as it grows.
Cover each supported option and meaningful combinations; a complete Cartesian
product of unrelated props is not required.

The first-launch flow now runs live new-vault creation and recovery setup on the
Options page. S02 exposes the actual creation, recovery, verification, unlock,
interruption, and completion components with synthetic gallery-only drivers.
See [the setup implementation](./vault-setup.md) for persistence and session contracts.

### Original build and integration checklist

- [x] A. Apply the exact preset and align fonts/icons.
- [x] B. Generate B01–B38 and retain existing compatibility fixes.
- [x] C. Build shared presentation and navigation examples.
- [x] D. Build feature-owned widgets with public exports and synthetic drivers.
- [x] E. Build F01–F07 with controlled drafts and response selectors.
      Technical validation is recorded in the gallery notes; the full visual
      and accessibility acceptance matrix remains step F.
- [x] Entries-library integration: extend P11 with an entries-owned `SiteIcon`,
      reusing B38 Avatar and bundled fixtures for loaded, loading, unavailable
      and failed states. Review both themes, fallback contrast and website labels
      before entries-screen assembly. Browser permissions and lookup are later
      integration work, as scheduled in the [favicon plan](./favicon-review.md#planned-work-and-implementation-triggers).
- [ ] F. Review the entire library's visual consistency and accessibility evidence.
      The gate applies to all catalog IDs, not only the setup subset.
- [x] G. Assemble and integrate new-vault setup, recovery, verification and local lock settings.
- [x] Assemble Options entry/sync screens and popup entry quick access.
- [x] Assemble existing-vault enrollment.
- [x] H. Connect new-vault setup to composed workflows and validate in Chrome.
- [x] Connect entry and sync workflows through composed capabilities.
- [x] Connect existing-vault enrollment.
- [ ] Implement the extension-level icon preference workflow and browser
      capability, then complete the favicon runtime acceptance checks before
      enabling browser icons in a release.

Application workflows are integrated at the current scope; subsequent runtime
integration must keep the component gallery current.

## Definition of library ready

- Every B/P/F ID has an implementation or a documented consolidation into another
  catalog export, its listed fixtures, and recorded visual review. Consolidation
  preserves all behavior; it does not remove a component from scope silently.
- Applicable states, both themes, long content, keyboard/focus, reflow and reduced
  motion have been checked. Critical explanations are readable before interaction.
- Existing project type-check/lint/build checks pass. Meaningful interaction tests
  cover controlled input/reveal, verification errors, overlay focus and stale async
  fixture resets; avoid tests that only mirror static markup or styling classes.
- Gallery code and fixtures are absent from the production artifact. Shared
  components have no forbidden adapter/secret persistence dependencies.
- Remaining disaster-recovery and browser-runtime limitations are recorded as
  follow-up work. Gallery completion alone does not certify runtime behavior.
