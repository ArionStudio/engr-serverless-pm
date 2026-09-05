# Review inventory and ownership

Updated 2026-09-05. All **75 catalog IDs** have rendered gallery examples: 38 base controls, 28 presentation families, seven forms and two current screen views. IDs describe review scope, not file count. Status for every row is **implemented for review**. Visual approval, full accessibility acceptance and connected extension workflows are still pending.

Use the gallery collection navigation or **Find a component or widget**. Theme, canvas width and **Reset examples** apply to every collection. State selectors expose synthetic outcomes; buttons call local drivers. The gallery uses no connected vault, network operation, clipboard write, real download, print job or trust verification.

## What belongs where

A React component can implement a shared control, a feature widget or an entire page. File size and the word “component” do not decide its architectural layer. Here we use the repository’s feature-slice adaptation, not every layer of canonical FSD.

| Kind                            | Placement and boundary                                                                                     |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Shared control                  | `ui/components/primitives`; generated Base UI/shadcn APIs.                                                 |
| Shared presentation             | `ui/components/forms`, `feedback`, `layout`; typed values, callbacks and layout slots. No feature imports. |
| Feature control, widget or form | Owning `ui/features/<slice>` with explicit exports in `index.ts`. No peer-feature imports.                 |
| Cross-feature page composition  | `ui/entrypoints`; combines feature public APIs through props, callbacks and slots.                         |

For example, `RecoveryVerification`, `EntryTable`, `SyncReview` and `DeviceSummary` remain in their slices. `DestructiveConfirmation` is shared because its identity, consequences and action policy are supplied. `LocalRecoveryForm` receives a vault-selector slot; the gallery composes `VaultPicker` there without a recovery-to-vault-access dependency. P28 navigation is an entrypoint composition.

If the same substantial cross-feature composition is reused by popup and options, extract that concrete block into `ui/widgets/<name>` with its own public API. Do this when the screen composition proves the need. A one-page block can remain in that page. This follows the purpose of [FSD widgets](https://feature-sliced.design/docs/reference/layers#widgets), while retaining this repository’s documented folder adaptation. Imports go through [explicit public APIs](https://feature-sliced.design/docs/reference/public-api). These references were rechecked on 2026-09-05.

## Catalog

All paths below are relative to `apps/extension/src/ui`. Feature links point to the supported import boundary.

| ID  | Review family                                                   | Owner / source                                                                                                                             |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| B01 | Button                                                          | [components/primitives/button.tsx](../../apps/extension/src/ui/components/primitives/button.tsx)                                           |
| B02 | Field                                                           | [components/primitives/field.tsx](../../apps/extension/src/ui/components/primitives/field.tsx)                                             |
| B03 | Input                                                           | [components/primitives/input.tsx](../../apps/extension/src/ui/components/primitives/input.tsx)                                             |
| B04 | Input Group                                                     | [components/primitives/input-group.tsx](../../apps/extension/src/ui/components/primitives/input-group.tsx)                                 |
| B05 | Textarea                                                        | [components/primitives/textarea.tsx](../../apps/extension/src/ui/components/primitives/textarea.tsx)                                       |
| B06 | Native Select                                                   | [components/primitives/native-select.tsx](../../apps/extension/src/ui/components/primitives/native-select.tsx)                             |
| B07 | Checkbox                                                        | [components/primitives/checkbox.tsx](../../apps/extension/src/ui/components/primitives/checkbox.tsx)                                       |
| B08 | Radio Group                                                     | [components/primitives/radio-group.tsx](../../apps/extension/src/ui/components/primitives/radio-group.tsx)                                 |
| B09 | Slider                                                          | [components/primitives/slider.tsx](../../apps/extension/src/ui/components/primitives/slider.tsx)                                           |
| B10 | Alert                                                           | [components/primitives/alert.tsx](../../apps/extension/src/ui/components/primitives/alert.tsx)                                             |
| B11 | Badge                                                           | [components/primitives/badge.tsx](../../apps/extension/src/ui/components/primitives/badge.tsx)                                             |
| B12 | Spinner                                                         | [components/primitives/spinner.tsx](../../apps/extension/src/ui/components/primitives/spinner.tsx)                                         |
| B13 | Skeleton                                                        | [components/primitives/skeleton.tsx](../../apps/extension/src/ui/components/primitives/skeleton.tsx)                                       |
| B14 | Accordion                                                       | [components/primitives/accordion.tsx](../../apps/extension/src/ui/components/primitives/accordion.tsx)                                     |
| B15 | Tooltip                                                         | [components/primitives/tooltip.tsx](../../apps/extension/src/ui/components/primitives/tooltip.tsx)                                         |
| B16 | Dropdown Menu                                                   | [components/primitives/dropdown-menu.tsx](../../apps/extension/src/ui/components/primitives/dropdown-menu.tsx)                             |
| B17 | Alert Dialog                                                    | [components/primitives/alert-dialog.tsx](../../apps/extension/src/ui/components/primitives/alert-dialog.tsx)                               |
| B18 | Separator                                                       | [components/primitives/separator.tsx](../../apps/extension/src/ui/components/primitives/separator.tsx)                                     |
| B19 | Dialog                                                          | [components/primitives/dialog.tsx](../../apps/extension/src/ui/components/primitives/dialog.tsx)                                           |
| B20 | Tabs                                                            | [components/primitives/tabs.tsx](../../apps/extension/src/ui/components/primitives/tabs.tsx)                                               |
| B21 | Empty                                                           | [components/primitives/empty.tsx](../../apps/extension/src/ui/components/primitives/empty.tsx)                                             |
| B22 | Item                                                            | [components/primitives/item.tsx](../../apps/extension/src/ui/components/primitives/item.tsx)                                               |
| B23 | Card                                                            | [components/primitives/card.tsx](../../apps/extension/src/ui/components/primitives/card.tsx)                                               |
| B24 | Combobox                                                        | [components/primitives/combobox.tsx](../../apps/extension/src/ui/components/primitives/combobox.tsx)                                       |
| B25 | Button Group                                                    | [components/primitives/button-group.tsx](../../apps/extension/src/ui/components/primitives/button-group.tsx)                               |
| B26 | Attachment                                                      | [components/primitives/attachment.tsx](../../apps/extension/src/ui/components/primitives/attachment.tsx)                                   |
| B27 | Sidebar                                                         | [components/primitives/sidebar.tsx](../../apps/extension/src/ui/components/primitives/sidebar.tsx)                                         |
| B28 | Sheet                                                           | [components/primitives/sheet.tsx](../../apps/extension/src/ui/components/primitives/sheet.tsx)                                             |
| B29 | Table                                                           | [components/primitives/table.tsx](../../apps/extension/src/ui/components/primitives/table.tsx)                                             |
| B30 | Pagination                                                      | [components/primitives/pagination.tsx](../../apps/extension/src/ui/components/primitives/pagination.tsx)                                   |
| B31 | Switch                                                          | [components/primitives/switch.tsx](../../apps/extension/src/ui/components/primitives/switch.tsx)                                           |
| B32 | Popover                                                         | [components/primitives/popover.tsx](../../apps/extension/src/ui/components/primitives/popover.tsx)                                         |
| B33 | Toast                                                           | [components/primitives/toast.tsx](../../apps/extension/src/ui/components/primitives/toast.tsx)                                             |
| B34 | Progress                                                        | [components/primitives/progress.tsx](../../apps/extension/src/ui/components/primitives/progress.tsx)                                       |
| B35 | Toggle Group                                                    | [components/primitives/toggle-group.tsx](../../apps/extension/src/ui/components/primitives/toggle-group.tsx)                               |
| B36 | Resizable                                                       | [components/primitives/resizable.tsx](../../apps/extension/src/ui/components/primitives/resizable.tsx)                                     |
| B37 | Kbd                                                             | [components/primitives/kbd.tsx](../../apps/extension/src/ui/components/primitives/kbd.tsx)                                                 |
| B38 | Avatar                                                          | [components/primitives/avatar.tsx](../../apps/extension/src/ui/components/primitives/avatar.tsx)                                           |
| F01 | UnlockForm                                                      | [features/vault-access/index.ts](../../apps/extension/src/ui/features/vault-access/index.ts)                                               |
| F02 | EntryForm                                                       | [features/entries/index.ts](../../apps/extension/src/ui/features/entries/index.ts)                                                         |
| F03 | PasswordCreationForm                                            | [features/vault-setup/index.ts](../../apps/extension/src/ui/features/vault-setup/index.ts)                                                 |
| F04 | PasswordChangeForm                                              | [features/vault-access/index.ts](../../apps/extension/src/ui/features/vault-access/index.ts)                                               |
| F05 | CredentialForm                                                  | [features/sync/index.ts](../../apps/extension/src/ui/features/sync/index.ts)                                                               |
| F06 | LocalRecoveryForm                                               | [features/recovery/index.ts](../../apps/extension/src/ui/features/recovery/index.ts)                                                       |
| F07 | DeviceSettingsForm                                              | [features/devices/index.ts](../../apps/extension/src/ui/features/devices/index.ts)                                                         |
| P01 | StepNavigation                                                  | [components/layout/sections.view.tsx](../../apps/extension/src/ui/components/layout/sections.view.tsx)                                     |
| P02 | SetupLayout                                                     | [components/layout/sections.view.tsx](../../apps/extension/src/ui/components/layout/sections.view.tsx)                                     |
| P03 | SettingsSection                                                 | [components/layout/sections.view.tsx](../../apps/extension/src/ui/components/layout/sections.view.tsx)                                     |
| P04 | SafetyHelp                                                      | [components/layout/sections.view.tsx](../../apps/extension/src/ui/components/layout/sections.view.tsx)                                     |
| P05 | PasswordField                                                   | [components/forms/fields.view.tsx](../../apps/extension/src/ui/components/forms/fields.view.tsx)                                           |
| P06 | PasswordStrengthFeedback                                        | [components/forms/fields.view.tsx](../../apps/extension/src/ui/components/forms/fields.view.tsx)                                           |
| P07 | LockDurationField                                               | [components/forms/fields.view.tsx](../../apps/extension/src/ui/components/forms/fields.view.tsx)                                           |
| P08 | ThemeControl                                                    | [features/theme/index.ts](../../apps/extension/src/ui/features/theme/index.ts)                                                             |
| P09 | VaultPicker                                                     | [features/vault-access/index.ts](../../apps/extension/src/ui/features/vault-access/index.ts)                                               |
| P10 | SearchField                                                     | [features/entries/index.ts](../../apps/extension/src/ui/features/entries/index.ts)                                                         |
| P11 | EntryRow, EntryList, EntrySelection and EntryTable              | [features/entries/index.ts](../../apps/extension/src/ui/features/entries/index.ts)                                                         |
| P12 | DetailField                                                     | [components/layout/sections.view.tsx](../../apps/extension/src/ui/components/layout/sections.view.tsx)                                     |
| P13 | SecretField                                                     | [components/feedback/action-feedback.view.tsx](../../apps/extension/src/ui/components/feedback/action-feedback.view.tsx)                   |
| P14 | CopyAction                                                      | [components/feedback/action-feedback.view.tsx](../../apps/extension/src/ui/components/feedback/action-feedback.view.tsx)                   |
| P15 | EmptyState, including EmptyVault                                | [components/layout/sections.view.tsx](../../apps/extension/src/ui/components/layout/sections.view.tsx)                                     |
| P16 | RecoveryPhraseGrid                                              | [features/recovery/index.ts](../../apps/extension/src/ui/features/recovery/index.ts)                                                       |
| P17 | RecoveryExportChoices and RecoveryGuide                         | [features/recovery/index.ts](../../apps/extension/src/ui/features/recovery/index.ts)                                                       |
| P18 | RecoveryWordInput                                               | [features/recovery/index.ts](../../apps/extension/src/ui/features/recovery/index.ts)                                                       |
| P19 | RecoveryVerification                                            | [features/recovery/index.ts](../../apps/extension/src/ui/features/recovery/index.ts)                                                       |
| P20 | GeneratorControls and GeneratedValue                            | [features/password-tools/index.ts](../../apps/extension/src/ui/features/password-tools/index.ts)                                           |
| P21 | SyncStatus                                                      | [features/sync/index.ts](../../apps/extension/src/ui/features/sync/index.ts)                                                               |
| P22 | ComparisonRow, ResolutionSelector, ReviewSummary and SyncReview | [features/sync/index.ts](../../apps/extension/src/ui/features/sync/index.ts)                                                               |
| P23 | DeviceSummary                                                   | [features/devices/index.ts](../../apps/extension/src/ui/features/devices/index.ts)                                                         |
| P24 | TransferInput and TransferOutput                                | [features/devices/index.ts](../../apps/extension/src/ui/features/devices/index.ts)                                                         |
| P25 | DestructiveConfirmation                                         | [components/feedback/destructive-confirmation.view.tsx](../../apps/extension/src/ui/components/feedback/destructive-confirmation.view.tsx) |
| P26 | ActionFeedback                                                  | [components/feedback/action-feedback.view.tsx](../../apps/extension/src/ui/components/feedback/action-feedback.view.tsx)                   |
| P27 | TagSelection                                                    | [features/entries/index.ts](../../apps/extension/src/ui/features/entries/index.ts)                                                         |
| P28 | AppNavigation and VaultToolbar                                  | [entrypoints/components/app-navigation.view.tsx](../../apps/extension/src/ui/entrypoints/components/app-navigation.view.tsx)               |

Label and Toggle are generated dependencies, demonstrated within their parent families. P08 reuses the existing ThemeToggle. P11 includes both list and interactive table presentations. P17 includes the printable guide. These are deliberate consolidations, not missing catalog IDs.

## Library decisions after verification

| Library          | Current decision                                               | Evidence / limit                                                                                                                                                                                                              |
| ---------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| shadcn / Base UI | Keep exact preset `b2CjQp4R0`; 38 controls generated.          | CLI owns source generation. Manual accessibility and compatibility fixes remain reviewable.                                                                                                                                   |
| TanStack Table   | Adopt pinned `@tanstack/react-table@9.2.4` for P11.            | Real React table with filtering, sorting, pagination and stable-ID selection. Explicitly copies only `id`, `login`, `sanitizedUrl`, and numeric tag IDs before creating rows. Tag labels come from supplied display metadata. |
| TanStack Form    | Do not adopt inspected 1.33.5 unchanged for secret forms.      | Published event-client reproduction retained earlier values after reset/unmount notifications. See the verification report below.                                                                                             |
| Query            | Defer.                                                         | A general cache requires explicit vault/session scope, invalidation and secret exclusion. It is not needed for these presentations.                                                                                           |
| Router           | Existing React Router remains available; no additional router. | Page assembly will decide navigation. No secrets in URL or persisted route state.                                                                                                                                             |
| Virtual          | Defer until measured list size and rendering cost justify it.  | Current gallery does not need virtualization.                                                                                                                                                                                 |
| tRPC             | Exclude from this initial frontend library.                    | Existing typed in-process use cases already define the application boundary. Cross-context messaging needs narrow sender-validated contracts, not an automatic RPC layer.                                                     |

The [TanStack verification report](./tanstack-verification.md) records pinned artifacts, checksums, executable tests and the limits of those findings. Table is not a secret-safety mechanism: hidden columns still retain their original input. Display metadata is private too and must be discarded on lock or vault changes in the real controller. The shadcn [Data Table guide](https://ui.shadcn.com/docs/components/base/data-table), rechecked on 2026-09-05, uses Table v9 and leaves application-specific data/behavior to the application.

`react-resizable-panels` was added by the shadcn Resizable generator. TanStack Form, Query, Virtual and tRPC were not installed. Forms use controlled local drafts and supplied errors, with shared fields and form actions. No alternative form framework or custom validation engine was introduced.

## What the examples do and what remains

- Recovery words are deliberately invalid `demo-01` through `demo-24`. The challenge fixture uses positions 3, 11 and 20; retries keep those positions. Production must supply three distinct randomly selected positions per challenge. The widget never receives expected answers.
- Export buttons record only the requested method. The guide previews all 24 positions and labels them as demonstration data. Producing PDF/TXT, printing, clipboard access and artifact lifecycle are integration work.
- Form response selectors demonstrate idle, pending, retained-input error and cleared-draft success. Cancel and success remount secret fields to clear reveal state. These are presentation examples; core still owns validation, password policy and operation results.
- F02 add/edit drafts remain controlled. Loading an existing password and deciding whether blank replacement means unchanged need the owner’s deliberate policy before integration. No title, note, folder or arbitrary tag-creation fields were added.
- P20 supports supplied password and username settings. Demo output is fixed and explicitly does not represent the selected settings or implement randomness.
- Sync review accepts only supplied local/remote choices and blocks incomplete, stale or pending submission. It does not merge vault branches. Device artifacts are inert text/file-selection callbacks and are never treated as trusted by the presentation.
- Device-local lock examples include the accepted 10-minute default; actual inactivity semantics and persistence still need an application contract.
- No live setup, session invalidation, cross-context lock or cancellation guarantees follow from this standalone gallery. The [setup gaps](./vault-setup.md#implementation-gaps) remain blocking for production workflow integration.

## Recovery of the agreed scope

Rewind read relevant messages from T3 thread `b347c5f7-5efd-4190-911c-efee1d697ac8`, **Merge Main Changes Locally**, in this repository. The focused extracts covered 2026-09-05 00:34:20–00:48:34 UTC and 02:00:58–02:31:15 UTC. They confirm full-library-before-screens ordering, the expanded controls and the subsequent TanStack verification correction. The latest widget-classification request is incorporated above. No SQLite state was modified.

## Validation on 2026-09-05

- Extension production build, gallery production build, TypeScript and lint passed.
- The extension suite passed 462 tests in 35 files. The seven gallery interaction
  tests passed again after the final field-association changes.
- Chrome rendered the expected 73 catalog IDs in both light and dark themes at
  viewport widths 1440, 768, 400 and 320. No document overflow, browser errors or
  external requests occurred. The run exercised 124 selectable example states.
- Browser interactions covered table filtering, sorting, stable selection and reset;
  safe initial confirmation focus, required acknowledgment and pending completion;
  toast cleanup on reset; Popover Escape dismissal; and all 24 printable-guide positions.
- Reduced motion was enabled for the matrix. A separate 640×500 CSS viewport
  checked reflow equivalent to halving a 1280×1000 layout. This is not a claim
  of a complete browser-zoom or assistive-technology audit.
- Desktop light/dark forms and the 320px form view were visually inspected.
  The page remains available through the managed gallery server for user review.
- Production manifest/JavaScript checks found no gallery entry or fixture strings.
  The import scan found no peer-feature imports and no shared-presentation imports
  of features, extension runtime or adapters. Documentation's local links resolve.

Visual approval and full accessibility acceptance remain pending. These results
validate the standalone presentations, not extension session or recovery workflows.

## Usage guidance and table review follow-up

Each of the 73 gallery entries now includes a visible explanation of when to use
it. Non-obvious controls describe a vault use case and their scope. Examples
include Switch versus a saved checkbox choice, Popover versus a larger Dialog,
and the optional Resizable layout for an options-page entry list and detail pane.
The Resizable specimen now lets the reviewer select an entry and resize its panes.

Gallery copy lives in `src/gallery/usage.ts`, checked against the catalog ID union
so adding an ID also requires its explanation. The shared gallery renderer keeps
this review guidance out of product components. Future guidance should explain
purpose and usage rather than repeat the component name or just show its import.

B29 now displays the same feature-owned interactive EntryTable example as P11.
The shared Table controls still own only markup and styling. EntryTable owns its
search, tag filter, column visibility, row actions, pagination and selection UI.
The richer example has 24 synthetic entries and selectable ready/loading/error/empty
states. At narrow container widths, rows reflow into labeled entry summaries with
a separate sort selector. Website and tag columns can be hidden on either layout.

Selection stays across pages and resets when filters change, so a filtered view
cannot silently act on an earlier invisible selection. Multi-selection is enabled
only when the caller supplies `onReviewSelection`; otherwise selection opens one
entry. Edit, removal review, retry and creation are optional callbacks. No bulk
mutation, clipboard operation or live vault workflow was added. The owner still
must remount or invalidate the feature when the vault/session changes.

Follow-up validation: extension and gallery production builds and lint passed.
All nine gallery interaction tests passed. Chrome found exactly 73 usage
explanations across the six collections and passed 48 collection/theme/viewport
checks at 1440, 768, 400 and 320 pixels without overflow. Browser interactions
verified selected-ID review across pages, filter resets, optional columns, row
actions, table states, mobile sorting and keyboard resizing of the example panes.
The gallery guidance and callback fixture strings remain outside production JS.

## Contrast verification

The [contrast review](./contrast-review.md) summarizes measurements across all
73 entries in both themes, scenario states, control hover/focus and open overlays.
Accessibility overrides retain the preset design basis while correcting measured
failures. Future screen compositions still need validation.

Website icons are accepted planned work, not an implemented part of the 73-entry
review evidence above. Extend P11 with `SiteIcon` and bundled gallery fixtures
during entries-library work, reusing B38. Add the browser capability and device-local
preference workflow when integrating entries/settings. See the
[staged favicon plan and acceptance checks](./favicon-review.md#planned-work-and-implementation-triggers).

## Living gallery coverage follow-up

The generated `component-api.generated.ts` records 273 exported components and
compound parts, their source ownership, and 72 visual variant axes. Every family
lists its members; the finder includes each named member. The one explicitly
nonvisual runtime module, ThemeProvider, is documented under P08 and reviewed
through controlled ThemeToggle state.

| Added family | Actual implementation | Review boundary |
| --- | --- | --- |
| S01 | `ui/entrypoints/popup/popup.view.tsx` | First-launch handoff, loading/existing/error states |
| S02 | `ui/entrypoints/options/options.view.tsx` | Setup choices, password/device preview, connection explanation, appearance |

Supported visual prop values come from TypeScript rather than a second handwritten
option list. Each chooser binds to an actual implementation in the fixture recipe.
The build rejects missing ownership, stale generated metadata, missing variant
bindings and missing JSX consumers in the gallery import graph. This static
analysis does not replace runtime review or detect every possible conditional
rendering gap. New visual prop naming conventions need a checker update.

The options entrypoint owns theme persistence; OptionsView is now controlled so
its gallery preview cannot change stored preferences. Variant review also exposed
a Tabs bug: the orientation prop was not forwarded to Base UI, which kept
vertical keyboard navigation horizontal. The fixed component has an Arrow Down
regression test and both orientations in the gallery.

Validation of this follow-up:

- The production extension build, gallery build and lint passed. The full extension
  suite passed 466 tests in 36 files. All 11 gallery interaction tests passed again
  after the final layout changes. Production JS/HTML contains no gallery fixture
  markers or review route.
- Chrome checked all 75 families in light/dark themes at 1440px and 320px. No
  document or specimen overflow was found. Representative Avatar, Sidebar and
  narrow Input Group specimens were also visually inspected.
- All 263 declared options were selected in each theme/width combination, for
  1,052 selections. Real fixture recipes rendered without browser errors. Portal
  recipes were opened for placement/size review. Compound-part navigation selected
  TabsList, and Reset examples restored the initial component.
- The variant run recorded 117,364 settled-color measurements with zero
  failures. The behavior/hover/focus run recorded 62,462 measurements across
  210 theme/state combinations, also with zero failures. Generated JSON reports
  stay in ignored local storage; reproduction commands are in the
  [contrast review](./contrast-review.md#reproduce). This is regression evidence,
  not complete accessibility certification.
- Input Group addon variants exposed negative margins extending beyond the
  control boundary. Removed those margins and reran the full variant matrix.
  The separator fixture now changes its host direction with its orientation.

The first-launch screen implementation below completes this presentation step.
Live creation and recovery continuation remain the next integration work.

## Unpacked extension packaging verification

Loading the real extension exposed two build issues that gallery verification
could not catch: a reserved `_commonjsHelpers.js` filename and generated module
preload hints rejected by Chrome's extension resource loader. Generated chunks
now use a `chunk-` prefix. The extension build disables module preloading and
checks output filenames and HTML. The gallery build remains separate.

`verification/unpacked.verify.cjs` loads the built extension through Chrome's
DevTools Protocol in an empty temporary profile. It checks popup/options rendering,
background worker startup, page errors, console warnings and CDP Log warnings,
waiting six seconds on each page for delayed unused-preload reports. The expanded
check reproduced the reported warnings before the fix. Chrome 152.0.7977.75 then
passed with no errors or warnings after the fix; build and lint also passed.

Run from the repository root after `pnpm ext:build`, with an installed Playwright:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright \
node docs/ui-ux/verification/unpacked.verify.cjs
```

References: [Vite module preload configuration](https://vite.dev/config/build-options.html#build-modulepreload)
and [Chrome's unpacked extension loader](https://chromedevtools.github.io/devtools-protocol/tot/Extensions/#method-loadUnpacked).

## First-launch screen implementation

The extension now renders the same first-launch views reviewed in S01/S02.
**Set up vault** opens Chrome’s real options page. Options offers create/connect
choices, password and confirmation with core strength assessment, a device-name
and lock-duration preview, a connection explanation and appearance controls.
The popup handles pending/opening failures; both roots check local vault metadata
and show distinct loading, failure and existing-vault presentations.

This is explicitly a **setup preview**, not live vault creation. It asks for sample
passwords and does not invoke initialization or enrollment, generate recovery
words, or persist setup drafts/preferences. Appearance is a real preference.
The device step ends with **Finish preview**, which clears the draft. Back retains
the sample password; leaving the journey or opening Appearance clears it.

The unfinished recovery-continuation and preference contracts in
[vault-setup.md](./vault-setup.md#implementation-gaps) still gate live creation.
No temporary plaintext recovery persistence or fake success state was introduced.

SetupWelcome, SetupPassword, SetupDevice and SetupConnection belong to the setup
feature and S02 family. Runtime capabilities are injected at extension roots;
the application graph is constructed lazily once per context using the existing
composition factory. Gallery callbacks remain synthetic and never import runtime
composition. The inventory now names 273 exported components/parts in 75 families.

Validation: 469 extension tests passed, including new handoff failure/retry,
confirmation/focus, Back/reset and existing-vault cases. Both builds and lint
passed. Chrome checked 72 screen/theme/width states at 1440, 400 and 320 pixels
with no contrast failures, document overflow or browser errors. The real unpacked
extension passed popup-to-options navigation, password/device preview, clearing
on completion and theme selection with no delayed Chrome resource warnings.

## No-subtitles revision

The user rejected heading subtitles and filler copy. The popup and options views
now use direct task titles. Removed eyebrow slogans, marketing footers, the
recovery side column, repeated warnings, and the heading/body/button card pattern.
Setup choices are direct actions; forms use one column. Recovery requirements
remain available through a disclosure, and the preview limitation stays explicit.
Empty password fields no longer display an assessment instruction.

This applies to the actual screen imports in S01/S02 and PasswordCreationForm in
F03. The no-subtitles rule is persistent in AGENTS.md and UI-007. The approved Mira
tokens, Figtree and Hugeicons are unchanged. Screen behavior and the live-creation
boundary are unchanged.

Validation after the revision: production build and lint passed; all 14 targeted
UI/gallery tests passed. Chrome checked 72 screen/theme/width combinations with
no contrast failures, overflow or browser errors. The unpacked extension passed
the popup handoff, password/device preview, completion reset and appearance
journey without delayed resource warnings.

## Setup cards and product copy

The start screen uses two large cards for creating a vault or connecting an
existing one. Cards sit side by side when space permits and stack on narrow
screens. Subsequent forms keep their single-column layout. Heading subtitles
remain omitted.

Removed synthetic, sample, demonstration and preview notices from product screens
and gallery content at the user's request. Component usage notes and behavior
selectors remain available. The device-step action is now Cancel setup, matching
its form-reset behavior. It does not report vault creation or persistence.
Vault creation and enrollment are still not connected; this remains an
implementation boundary documented here rather than a product banner.

S01/S02 render the updated screen implementations; P17 uses the recovery record
without a demonstration banner. The gallery API inventory was regenerated.

Validation: production build, gallery build and lint passed, with all 14 targeted
UI/gallery tests passing. Chrome checked 72 screen/theme/width combinations with
no contrast failures, overflow or browser errors. The unpacked extension passed
popup-to-options navigation, password/device steps, cancellation and appearance
selection without delayed resource warnings. Clarke's unpacked build was updated
and verified by checksum.

## Selectable setup paths

S02 uses two large radio cards with a visible selection indicator and selected
border. Clicking a card or its requirements selects it; arrow keys move between
options. Continue opens the selected path. New vault is selected initially.
Each card contains its own visible What do I need? list, replacing the shared
disclosure. Labels explicitly name the Base UI radios.

Validation: build and lint passed; all 15 targeted UI/gallery tests passed,
including label clicks, requirement-text clicks, arrow-key selection and routing
only after Continue. Chrome checked 72 screen/theme/width combinations without
contrast failures, overflow or browser errors. The real unpacked extension
passed the setup journey without resource warnings.

## Password-step feedback

S02 and F03 now keep recovery guidance in recovery components, use one Back action
and place Continue on the right. Password fields explain device scope, report
Caps Lock only while detected in the focused input, and keep Show/Hide controls.
P06 uses named ratings after password entry. Empty input has no strength block
or reserved space. The core policy still requires its highest score, presented as Strong.
Confirmation feedback appears on blur or submit, with a distinct empty-field
message and immediate match feedback. Editing one field does not clear unrelated
errors. Pending or failed strength checks cannot advance setup; failed checks
have an explicit retry action and are not described as weak passwords.

Validation: production and gallery builds plus lint passed; all 19 targeted
UI/gallery tests passed. Tests cover pending/failure/retry, stale assessments,
independent field errors, blur/match feedback and Caps Lock. Chrome checked 66
screen/rating/theme/width combinations with no contrast failures, overflow or
browser errors. This earlier layout check used the reserved feedback region;
the current empty-field behavior is documented below under Password feedback visibility.
The unpacked extension passed its setup journey without resource warnings.
Clarke's build was updated and verified by checksum.

## Requirement copy and review coverage

The password-strength area is hidden while the password is empty. It has no
placeholder copy or reserved empty space. Field copy
states requirements; extra explanations address security or safe data handling.
SetupLayout no longer requires a heading subtitle. StepNavigation distinguishes
current, completed, upcoming and failed steps through accessible labels and
completion/error icons. P01 exposes each state. F03 exposes assessment states
and retry; S02 adds pending and unavailable assessments, triggered by typing,
with successful retry for the unavailable state. All 22 focused UI/gallery tests
passed after these changes; extension lint and both builds also passed.

## Retry and numbered recovery contracts

First-launch application initialization can retry after a rejection while keeping
one successful application graph per context. Numbered recovery input takes
explicit word slots; whole-phrase text remains a separate string representation.
The gallery converts whitespace runs when changing from whole-phrase input to
numbered editing. Editing keeps intentional blank slots and preserves overlong
input for validation rather than discarding words. Positional errors and guidance
are associated with each input, with numbered error/disabled gallery states.
Removed internal ownership wording from entry and device forms.

## Private component coverage and capability reuse

The gallery inventories 279 components and parts, including six private JSX parts
under their owning families. Internal parts are labeled without exposing new
public exports. The inventory checker discovers private parts and rejects an
unrendered component; a temporary omission probe confirmed that failure.
First-launch vault reads and password assessment share the same lazy application
graph and the existing password-strength use case.

## Secret and search states

SecretField disables both Reveal and Copy during pending retrieval and in its
explicit disabled state, which P13 now exposes. P10 provides empty, filled and
searching scenarios using the real SearchField. Search accepts literal text and
uses responsive container width; the specification now reflects those contracts
instead of proposing invalid-query or named layout states without a use case.

## Pending, disabled and error fixtures

P07 exposes disabled and error lock-duration states. P19 exposes pending recovery
verification. P23 exposes pending revocation and errors; P24 exposes pending
output actions. P27 separates selected, none, loading, unavailable and error
scenarios. Loading tags retains selected labels, announces loading and disables
both entry and removal until the caller supplies ready metadata.

## Password feedback visibility

P06 renders nothing without an assessment. F03 and S02 omit the entire feedback
wrapper while the password is empty, then show feedback after typing. Clearing
the password removes it again. This replaces the earlier reserved empty region.
The gallery keeps its empty scenario; pending/unavailable form scenarios supply
a nonempty fixture password so their feedback remains reviewable.

## Assessment request ownership

Setup assessment state stores a non-secret request identity, score and failure
status. It no longer retains a password as its lookup key. Input edits clear the previous assessment; controlled updates invalidate its
request identity. Reentering the same value requires a fresh assessment. Effect cleanup still rejects stale asynchronous results.
P11 documents selection behavior in gallery usage; the product table no longer
repeats that explanation in a footer.

## Lock duration contract

Setup and gallery controls share labels derived from the core
`AVAILABLE_VAULT_LOCK_DELAYS_MS` list. Drafts use milliseconds and default to
600000. All five supported durations appear in P07, UnlockForm,
DeviceSettingsForm and the setup device screen.
