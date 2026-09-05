# shadcn reuse audit

Implementation follow-up: the eight recommended controls and ten further controls
now have gallery examples. All 73 catalog IDs are implemented for review.
The [review inventory](./review-inventory.md) supersedes the historical Add/Conditional
implementation statuses below, and records Table adoption and the Form exclusion.
This document retains the original catalog-wide research snapshot.

Checked 2026-09-05 against the [official component catalog](https://ui.shadcn.com/docs/components),
each entry's Base UI documentation and the
[base-mira registry](https://ui.shadcn.com/r/styles/base-mira/registry.json).
All 64 catalog entries were fetched successfully. The registry also contains two
UI names outside that page, covered below. The official blocks were checked by
category and registry membership, not visually approved one by one.

This is a documented inventory and fit assessment, not a claim that all upstream
components have been installed, rendered, security-reviewed or tested against our
Base UI 1.0.0. It covers the official catalog as fetched on this date, not every
third-party registry. [Machine-readable evidence](./shadcn-catalog-audit.json)
records all 64 names, source links, documentation hashes and direct dependency metadata.

## What changes in our plan

The previous 20-control list was an initial implementation batch, not a complete
reuse assessment. Its blanket exclusion of Combobox, Sidebar and Sheet was too
restrictive for the agreed full options-page application. The 28 product families
and seven forms describe product contracts; most should compose upstream parts.

Recommend eight more generated components before building those compositions:
**Empty, Item, Card, Combobox, Button Group, Attachment, Sidebar and Sheet**.
Sidebar also brings the `use-mobile` hook. This recommendation adds no new product
features: the corresponding needs already exist in P09/P11/P15/P17/P23/P24/P27/P28.
Use typography recipes for the rich explanations and printable guide as well.

The installed CLI dry run for those eight reported nine new files, seven existing
files proposed for overwrite and dependencies on `cn` and `@base-ui/react`.
Both packages are already installed. This was a preview only. Check `--diff` before
installation; do not accept overwrites merely because the CLI lists them, and do
not assume API compatibility from an unversioned dependency name.

Implementation follow-up: the eight additions are now generated through the CLI
and available in the gallery. Existing files were preserved. The table and JSON
below retain the audit-time decisions; “Add” records that recommendation.

## Every official component

Decisions are ours. **Generated** means present locally, not fully reviewed.
**Add** means recommended for the next base-library batch. **Conditional** means
use it when the named interaction is selected during library design, before its
owning composition is finalized. **No current use** means the present product
contracts do not call for it; it is not a permanent ban. **Guidance** is a recipe,
not a component to install.

Count: 8 add, 23 conditional, 21 generated, 1 guidance, 11 no current use.

| Official component                                                              | Decision       | Product fit / reason                                                                                                                           |
| ------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [Accordion](https://ui.shadcn.com/docs/components/base/accordion)               | Generated      | P04 safety detail; retain visible essential guidance.                                                                                          |
| [Alert](https://ui.shadcn.com/docs/components/base/alert)                       | Generated      | P04/P21/P26 persistent help, sync outcomes and errors.                                                                                         |
| [Alert Dialog](https://ui.shadcn.com/docs/components/base/alert-dialog)         | Generated      | P25 explicit destructive confirmation.                                                                                                         |
| [Aspect Ratio](https://ui.shadcn.com/docs/components/base/aspect-ratio)         | No current use | No image/video layout requirement in the catalog.                                                                                              |
| [Attachment](https://ui.shadcn.com/docs/components/base/attachment)             | Add            | P24 selected enrollment-file metadata and actions; P17 optional generated-file summary. Supply honest states; this does not implement file IO. |
| [Avatar](https://ui.shadcn.com/docs/components/base/avatar)                     | Conditional    | P09/P11/P23 local identity glyph or initials if useful; no image requirement yet.                                                              |
| [Badge](https://ui.shadcn.com/docs/components/base/badge)                       | Generated      | P11/P21/P23 statuses and tags; supply text as well as color.                                                                                   |
| [Breadcrumb](https://ui.shadcn.com/docs/components/base/breadcrumb)             | Conditional    | P28 nested location only if routes need hierarchy. Do not use breadcrumbs as setup-step semantics.                                             |
| [Bubble](https://ui.shadcn.com/docs/components/base/bubble)                     | No current use | No conversational interface.                                                                                                                   |
| [Button](https://ui.shadcn.com/docs/components/base/button)                     | Generated      | Shared actions across every product family and form.                                                                                           |
| [Button Group](https://ui.shadcn.com/docs/components/base/button-group)         | Add            | P14/P17/P20/P28 related copy, reveal, export and generator actions; preserve distinct action names.                                            |
| [Calendar](https://ui.shadcn.com/docs/components/base/calendar)                 | No current use | No date-selection field in the current contracts.                                                                                              |
| [Card](https://ui.shadcn.com/docs/components/base/card)                         | Add            | P02/P03/P23 meaningful grouped content with heading/action slots; avoid nesting a card around every field.                                     |
| [Carousel](https://ui.shadcn.com/docs/components/base/carousel)                 | No current use | Setup uses explicit steps and reviewable forms; no rotating content requirement.                                                               |
| [Chart](https://ui.shadcn.com/docs/components/base/chart)                       | No current use | No analytics feature or data series. The preset chart palette is not a feature requirement.                                                    |
| [Checkbox](https://ui.shadcn.com/docs/components/base/checkbox)                 | Generated      | P20 generator flags and small selection sets; explicit label association.                                                                      |
| [Collapsible](https://ui.shadcn.com/docs/components/base/collapsible)           | Conditional    | P04 single expandable detail or P28 nested navigation, if Accordion is not the chosen composition.                                             |
| [Combobox](https://ui.shadcn.com/docs/components/base/combobox)                 | Add            | P09 searchable vault names and P27 multiple selected tags with chips; keep small fixed-duration choices native.                                |
| [Command](https://ui.shadcn.com/docs/components/base/command)                   | Conditional    | Only for an explicitly designed command palette. Entry search already has P10; it does not require a command engine.                           |
| [Context Menu](https://ui.shadcn.com/docs/components/base/context-menu)         | Conditional    | P11 secondary right-click shortcuts if adopted; visible Dropdown Menu actions remain available.                                                |
| [Data Table](https://ui.shadcn.com/docs/components/base/data-table)             | No current use | A composition guide, not a single base-mira UI item. Current entries/reviews do not require sorting, column configuration or a grid engine.    |
| [Date Picker](https://ui.shadcn.com/docs/components/base/date-picker)           | No current use | A composition recipe; no date input in these forms.                                                                                            |
| [Dialog](https://ui.shadcn.com/docs/components/base/dialog)                     | Generated      | Bounded secondary tools/details; full vault setup stays on options.                                                                            |
| [Direction](https://ui.shadcn.com/docs/components/base/direction)               | Conditional    | Adopt if RTL locales enter the supported interface; current preset has RTL disabled.                                                           |
| [Drawer](https://ui.shadcn.com/docs/components/base/drawer)                     | Conditional    | Only for a demonstrated touch/swipe interaction. Sheet already covers the proposed narrow options navigation.                                  |
| [Dropdown Menu](https://ui.shadcn.com/docs/components/base/dropdown-menu)       | Generated      | P11/P23/P28 secondary actions, including explicit unavailable actions.                                                                         |
| [Empty](https://ui.shadcn.com/docs/components/base/empty)                       | Add            | P15 empty vault, no results and unavailable states; compose product copy and callbacks.                                                        |
| [Field](https://ui.shadcn.com/docs/components/base/field)                       | Generated      | All seven forms, including grouped controls, help, legends and errors.                                                                         |
| [Hover Card](https://ui.shadcn.com/docs/components/base/hover-card)             | Conditional    | Only nonessential rich previews with a keyboard-accessible route; never the primary explanation or secret display.                             |
| [Input](https://ui.shadcn.com/docs/components/base/input)                       | Generated      | Typed fields across forms, recovery word positions and generator numeric input.                                                                |
| [Input Group](https://ui.shadcn.com/docs/components/base/input-group)           | Generated      | P05/P10/P13/P20 reveal, clear and copy controls adjacent to values.                                                                            |
| [Input OTP](https://ui.shadcn.com/docs/components/base/input-otp)               | No current use | Three recovery words and a 24-word phrase are not fixed-length character codes.                                                                |
| [Item](https://ui.shadcn.com/docs/components/base/item)                         | Add            | P11 entry rows, P17 export choices, P22 review summaries and P23 devices; use Field for editable controls.                                     |
| [Kbd](https://ui.shadcn.com/docs/components/base/kbd)                           | Conditional    | P04/P28 hints for implemented keyboard actions; do not advertise nonexistent shortcuts.                                                        |
| [Label](https://ui.shadcn.com/docs/components/base/label)                       | Generated      | Dependency of Field, already present; not an additional product-family count.                                                                  |
| [Marker](https://ui.shadcn.com/docs/components/base/marker)                     | No current use | Conversation-oriented status/separator overlaps existing Alert, Badge and Separator without a current new requirement.                         |
| [Menubar](https://ui.shadcn.com/docs/components/base/menubar)                   | Conditional    | Only if options gains a persistent desktop command menu; current route links and action menus already cover navigation.                        |
| [Message](https://ui.shadcn.com/docs/components/base/message)                   | No current use | No chat/message model.                                                                                                                         |
| [Message Scroller](https://ui.shadcn.com/docs/components/base/message-scroller) | No current use | No streaming conversation, transcript restoration or message anchoring.                                                                        |
| [Native Select](https://ui.shadcn.com/docs/components/base/native-select)       | Generated      | P07 fixed lock durations; small fixed choices retain native interaction.                                                                       |
| [Navigation Menu](https://ui.shadcn.com/docs/components/base/navigation-menu)   | Conditional    | Horizontal link menus if the options navigation design needs them; Sidebar is the proposed primary structure.                                  |
| [Pagination](https://ui.shadcn.com/docs/components/base/pagination)             | Conditional    | P11 only when actual list sizing/data-loading calls for pages; do not invent pagination in core.                                               |
| [Popover](https://ui.shadcn.com/docs/components/base/popover)                   | Conditional    | P20 compact generator or P27 filter editor if an anchored editor is chosen; Combobox owns its own popup.                                       |
| [Progress](https://ui.shadcn.com/docs/components/base/progress)                 | Conditional    | P01 known step completion or genuinely measured work. No simulated upload percentage; strength is a score, not task progress.                  |
| [Questionnaire](https://ui.shadcn.com/docs/components/base/questionnaire)       | Conditional    | Compare for non-secret configuration questions. Do not adopt as the vault lifecycle controller; see the specific analysis below.               |
| [Radio Group](https://ui.shadcn.com/docs/components/base/radio-group)           | Generated      | P08 required theme choice and P22 one-of-two resolutions; styled choice cards are available within this family.                                |
| [Resizable](https://ui.shadcn.com/docs/components/base/resizable)               | Conditional    | P11/P22 optional adjustable options panes after a layout need is demonstrated; normal responsive columns remain supported.                     |
| [Scroll Area](https://ui.shadcn.com/docs/components/base/scroll-area)           | Conditional    | P11/P22/P28 bounded panes if custom scrollbars help; native overflow is already valid.                                                         |
| [Select](https://ui.shadcn.com/docs/components/base/select)                     | Conditional    | P09 rich non-searchable choices if needed. Combobox serves searchable lists; Native Select serves duration choices.                            |
| [Separator](https://ui.shadcn.com/docs/components/base/separator)               | Generated      | Shared group boundaries and dependency of Item/Button Group.                                                                                   |
| [Sheet](https://ui.shadcn.com/docs/components/base/sheet)                       | Add            | Dependency of Sidebar for narrow options navigation; also a candidate for secondary detail. It does not relocate setup from options.           |
| [Sidebar](https://ui.shadcn.com/docs/components/base/sidebar)                   | Add            | P28 options navigation across entries, tools, sync, devices and settings. Build its gallery composition before screens.                        |
| [Skeleton](https://ui.shadcn.com/docs/components/base/skeleton)                 | Generated      | P09/P11/P23 non-secret loading structures.                                                                                                     |
| [Slider](https://ui.shadcn.com/docs/components/base/slider)                     | Generated      | P20 generator length, paired with precise numeric editing.                                                                                     |
| [Spinner](https://ui.shadcn.com/docs/components/base/spinner)                   | Generated      | Indeterminate work across forms and actions; keep the documented Hugeicons prop correction.                                                    |
| [Switch](https://ui.shadcn.com/docs/components/base/switch)                     | Conditional    | Only for a boolean setting with immediate application. Theme has three choices; destructive sync disable needs confirmation.                   |
| [Table](https://ui.shadcn.com/docs/components/base/table)                       | Conditional    | P22 genuinely tabular comparisons if selected in gallery review; narrow layouts must remain readable. Does not require TanStack Table.         |
| [Tabs](https://ui.shadcn.com/docs/components/base/tabs)                         | Generated      | P20 password/username tool panels; application routes remain navigation links.                                                                 |
| [Textarea](https://ui.shadcn.com/docs/components/base/textarea)                 | Generated      | P18 whole-phrase editing and P24 inert transfer text.                                                                                          |
| [Toast](https://ui.shadcn.com/docs/components/base/toast)                       | Conditional    | P14/P26 optional transient acknowledgement. Keep recovery instructions and actionable failures persistent.                                     |
| [Toggle](https://ui.shadcn.com/docs/components/base/toggle)                     | Conditional    | P05/P13 reveal-state button if useful; an accessible Button with pressed state can already implement it.                                       |
| [Toggle Group](https://ui.shadcn.com/docs/components/base/toggle-group)         | Conditional    | Optional stateful toolbar controls. Retain Radio Group for required one-of-three theme choice and Tabs for panels.                             |
| [Tooltip](https://ui.shadcn.com/docs/components/base/tooltip)                   | Generated      | Supplementary labels/details for named controls.                                                                                               |
| [Typography](https://ui.shadcn.com/docs/components/base/typography)             | Guidance       | Use the heading, paragraph, list and code recipes for P02/P04/P17 and forms; there is no installable typography item.                          |

## Mapping every product family

These are composition recommendations. A listed source does not automatically
provide the product's validation, secret handling, workflow or copy. Parentheses
identify alternatives whose interaction must be chosen during gallery work.

| Family                           | Reuse                                                                                          | Product-specific work that remains                                                                                                            |
| -------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| P01 StepNavigation               | Button, Badge, Separator; semantic ordered list; optional Progress                             | Allowed navigation, current/completed/error labels and step reading order. There is no standalone Stepper in the audited catalog.             |
| P02 SetupLayout                  | Card parts where grouping helps, typography recipes, Separator                                 | Responsive step/content/help/action slots and heading hierarchy.                                                                              |
| P03 SettingsSection              | FieldSet/FieldLegend/FieldGroup, Separator; optional Card                                      | Section meaning, scope and destructive consequences; avoid nested boxes.                                                                      |
| P04 SafetyHelp                   | Alert, Accordion, typography; Collapsible as a single-detail alternative                       | Essential visible guidance, explanatory copy, detail order and readable long content.                                                         |
| P05 PasswordField                | Field, Input Group, InputGroupButton, Input; optional Toggle                                   | Controlled reveal, autocomplete intent, errors, clearing and accessible action names.                                                         |
| P06 PasswordStrengthFeedback     | Text, Badge; semantic score meter if visually useful                                           | Supplied 0–4 score, pending/unavailable distinction. Do not translate the score into password rules or task-completion percentage.            |
| P07 LockDurationField            | Field, Native Select                                                                           | Allowed durations and caller-supplied local timer wording.                                                                                    |
| P08 ThemeControl                 | Radio Group including its choice-card examples                                                 | Required system/light/dark choice and resolved appearance. Toggle Group is an alternative only if its selection semantics fit.                |
| P09 VaultPicker                  | Combobox, Empty, Spinner; Native Select/Select for small non-searchable variants               | Stable IDs, duplicate-name disambiguation, loading/error and create/connect actions.                                                          |
| P10 SearchField                  | Input Group, Input, clear Button, Spinner                                                      | Query state, IME-safe submission and result count; Command is unnecessary for ordinary list search.                                           |
| P11 EntryRow/List/Selection      | Item/ItemGroup, Badge, Dropdown Menu, Empty, Skeleton                                          | Visible entry fields, selection semantics, action boundaries and optional bounded scrolling.                                                  |
| P12 DetailField                  | Item content parts where useful; semantic definition list and links                            | Missing values, multiline layout and permitted URL presentation.                                                                              |
| P13 SecretField                  | Input Group or Item, Button, Spinner                                                           | Retrieval intent, concealed DOM, reveal lifecycle and error states.                                                                           |
| P14 CopyAction                   | Button, Button Group, Spinner; optional Tooltip/Toast                                          | Injected copy intent, truthful result and cleanup explanation.                                                                                |
| P15 EmptyState                   | Empty header/media/title/description/content and Button                                        | No-vault, empty-vault, no-results and unavailable copy/actions.                                                                               |
| P16 RecoveryPhraseGrid           | Semantic ordered list, Button; typography                                                      | Exactly 24 positions, explicit reveal, DOM concealment and responsive long words. No recovery-grid component is listed upstream.              |
| P17 RecoveryExportChoices/Guide  | Item, Button Group, Alert, Accordion, typography; Attachment for an actual output-file summary | Method-specific safety copy and states, ordered words and printable layout. Upstream does not generate our recovery files.                    |
| P18 RecoveryWordInput            | Field, Textarea, Input                                                                         | Whole-phrase/positional editing, paste and supplied errors. Input OTP is the wrong input model.                                               |
| P19 RecoveryVerification         | Field, Input, Button, Alert                                                                    | Three supplied distinct positions, controlled answers and retries; never pass expected answers into the view.                                 |
| P20 GeneratorControls/Value      | Tabs, Field, Checkbox, Slider, numeric Input, Input Group, Button Group                        | Supplied settings/results and callbacks; optional Popover only if an anchored editor is chosen.                                               |
| P21 SyncStatus                   | Badge, Alert, Spinner; Progress only for measured work                                         | Exact contextual sync states, permitted actions and no invented percentage/timestamp.                                                         |
| P22 Comparison/Resolution/Review | Item, Radio Group choice cards, Badge, Alert, Separator; optional Table                        | Local/remote/deleted meaning, allowed choices, hidden password values and narrow comparison layout.                                           |
| P23 DeviceSummary                | Item, Card parts, Badge, Dropdown Menu; optional local Avatar fallback                         | Identity, current-device state and supplied permitted actions.                                                                                |
| P24 TransferInput/Output         | Input type=file, Textarea, Attachment, Button Group, Alert                                     | File-selection callbacks, artifact descriptions and validation state. Attachment supplies presentation, not a file picker/parser/exporter.    |
| P25 DestructiveConfirmation      | Alert Dialog, Field when acknowledgment is needed, Spinner                                     | Consequences, safe focus, pending/error and confirm intent.                                                                                   |
| P26 ActionFeedback               | Alert, Spinner, status text; optional Toast                                                    | Announcement timing, persistent errors and retry; no raw exception text.                                                                      |
| P27 TagSelection                 | Combobox multiple/chips, Field                                                                 | Supplied IDs, selection limits, unavailable/loading states and named chip removal.                                                            |
| P28 AppNavigation/VaultToolbar   | Sidebar/Sheet for options, Button Group/Dropdown Menu for popup, Separator                     | Allowed route links, current location, lock/open-options callbacks and identity. Evaluate Kbd/Breadcrumb only for actual shortcuts/hierarchy. |

## Mapping every form

All forms use semantic `form`, Field grouping, descriptions/errors and Button/Spinner
submission states. shadcn also documents form-library integrations, but those are
separate implementation choices. The seven typed, controlled drafts do not require
a new form package solely because they are forms.

| Form                     | Reused product/control compositions | Form-specific work                                                                        |
| ------------------------ | ----------------------------------- | ----------------------------------------------------------------------------------------- |
| F01 UnlockForm           | P05/P07/P09/P26, Field, Button      | Selected vault, password, duration, wrong-password/busy outcomes.                         |
| F02 EntryForm            | P05/P06/P20/P27/P26, Field, Input   | Add/edit draft, existing-secret distinction and explicit supplied weak-password override. |
| F03 PasswordCreationForm | P05/P06/P04/P26, Field              | New/confirm values, independent reveals and supplied strength/mismatch errors.            |
| F04 PasswordChangeForm   | P05/P06/P04/P26, Field              | Current/new/confirm, current-device explanation and success clearing.                     |
| F05 CredentialForm       | Field/Input, P05/P04/P26            | Bucket/region/prefix/key ID/secret, testing versus saving and provider errors.            |
| F06 LocalRecoveryForm    | P09/P18/P05/P06/P04/P26             | Local-data requirement, phrase/new password draft and replacement-word handoff.           |
| F07 DeviceSettingsForm   | Field/Input, P07/P04/P26            | Editable suggested name, local duration and value preservation on failure.                |

## Cases that need more than matching a component name

### Questionnaire and setup

The [Questionnaire documentation](https://ui.shadcn.com/docs/components/base/questionnaire)
includes controlled navigation, optional answers, progress and a resume example.
It owns question/answer state; persistence and transport belong to the host. Its
Mira registry item introduces `@shadcn/react`. It is a real candidate for a
question-based configuration segment, not something to overlook because of its name.

Our setup also has password/confirmation fields, a one-time initialization result,
word display/export, verification, optional sync and cancellation/lock behavior.
Matching those to Questionnaire requires a specific prototype and lifecycle review.
The docs do not establish that its answer model is a drop-in fit. Prefer the
planned controlled forms and presentation-only step navigation until that fit is
demonstrated. This is a fit decision, not a claim that Questionnaire is insecure.

### Sidebar in an extension

The [Sidebar registry source](https://ui.shadcn.com/r/styles/base-mira/sidebar.json)
contains a `document.cookie` write for open state and a keyboard shortcut.
Before reuse, adapt presentation preference ownership to this extension and check
the shortcut. Keep persistence out of the shared component, as our existing
architecture requires. Its narrow-width behavior also brings Sheet and `use-mobile`.
Building these in the gallery does not mean assembling the options screens early.

### More controls do not imply more product features

The conditional rows remain available throughout library design. They are not
post-screen work by default. For example, compare a wide Table review with stacked
Item rows before finalizing P22, and an anchored Popover editor before finalizing
P20. Record the selected interaction; do not install every alternative or implement
a custom replacement without revisiting its upstream candidate.

## Registry-only entries and official blocks

The fetched registry contains two additional `registry:ui` names absent from the
64-entry component index:

- [`form`](https://ui.shadcn.com/r/styles/base-mira/form.json) is an empty registry
  item in the fetched response. It is not evidence of a ready-made seven-form library.
- [`sonner`](https://ui.shadcn.com/r/styles/base-mira/sonner.json) depends on
  `sonner` and `next-themes`. If transient feedback is selected, evaluate the
  official Base UI Toast first; we already own theme behavior. Do not assume old
  advice that Toast must mean Sonner still applies.

The [official blocks](https://ui.shadcn.com/blocks) are compositions of components.
The fetched Mira registry lists 30 block names, grouped below. Registry membership
is verified; only representative displayed source/examples were inspected. No
claim is made that every block file is compatible with this extension.

| Registry group                        | Count | Treatment                                                                                                                                                  |
| ------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sidebar-01` through `sidebar-16`     | 16    | Layout references for P28; `sidebar-07` demonstrates icon collapse. Reuse the component structure, then supply our permitted destinations and preferences. |
| `login-01` through `login-05`         | 5     | Form/layout references only. A vault unlock is not website account login; product fields, callbacks and recovery meaning remain ours.                      |
| `signup-01` through `signup-05`       | 5     | Layout references for creation forms; do not inherit account/OAuth assumptions or replace the agreed recovery flow.                                        |
| `dashboard-01`                        | 1     | Optional shell reference. Its chart/table dashboard is not a requirement for this password manager.                                                        |
| `preview`, `preview-02`, `preview-03` | 3     | Upstream previews, not application functionality.                                                                                                          |

Community registries may contain other components. They were not exhaustively
audited, and this report does not imply that an absent official component can
only be written from scratch. Evaluate an outside source only for a concrete gap,
with its dependency, Base UI and preset fit checked first.

## Execution order after this audit

1. Review the CLI diffs and generate the eight recommended additions; add their
   states to the gallery and account for dependency hooks.
2. Use the mapping above while building P01–P28. Select relevant conditional
   alternatives within each family's gallery work, before calling it complete.
3. Compose F01–F07, then review the entire library across themes, sizes, errors,
   keyboard behavior, motion preferences and long safety content.
4. Assemble application screens after that library review, starting with options
   vault setup. Live use-case integration remains a later layer.

This audit changes documentation only. No additional components or dependencies
were installed while preparing it.
