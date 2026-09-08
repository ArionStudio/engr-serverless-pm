# Screen and component inventory

Status: accepted product scope and visual preset with implemented application components.
See the [decision register](./README.md#decision-register) and
[verified sources](./references.md).

## Application map

Options is the full application. Popup renders compact versions of quick workflows
from the same feature slices. Opening options uses the existing extension page;
there is no separate setup application or externally hosted vault UI.

| Feature        | Options experience                                                                                  | Popup experience                                                                        | Shared product components                                                      |
| -------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Setup          | Create or connect; password; device settings; organization template; recovery save and verification | No-vault state and Set up vault action                                                  | SetupLayout, StepNavigation, SetupOrganization, SafetyHelp                     |
| Vault access   | Vault selection, unlock, locked-session screen                                                      | Vault selection, unlock, lock                                                           | VaultPicker, UnlockForm, PasswordField                                         |
| Entries        | Browse, search, view, add, edit, remove; assign one folder and multiple tags                        | Compact browsing and editing, reveal and copy                                           | EntryList, EntryRow, EntryForm, FolderPicker, TagSelection, SecretField        |
| Organization   | Manage the folder hierarchy and grouped flat tags                                                   | Create folders and tags while editing an entry                                          | OrganizationManagementView, FolderTree, FolderEditor, TagPill, TagVisualPicker |
| Password tools | Password and username generation                                                                    | Standalone tools or controls within entry editing                                       | GeneratorControls, GeneratedValue                                              |
| Sync           | S3 configuration, review, explicit resolutions, disable and credential cleanup                      | Status and actions that can hand off to review                                          | SyncStatus, SyncReview, ComparisonRow, CredentialForm                          |
| Devices        | Enrollment request/approval/import, revocation, transition review                                   | Explicit Options handoff                                                                | DeviceSummary, TransferInput, TransferOutput, ReviewSummary                    |
| Recovery       | Recover existing local device access; save replacement words                                        | Open the options recovery route                                                         | RecoveryPhraseGrid, RecoveryWordInput, RecoveryVerification                    |
| Settings       | Theme, local lock preference, local master-password change, local deletion                          | Theme, device name and local lock duration                                              | SettingsSection, ThemeControl, LockDurationField, DestructiveConfirmation      |
| Website logins | Entry management for reviewed saved logins                                                          | Gallery-only Fill, detection and capture review until runtime capabilities are supplied | EntrySelection, BrowserLoginsPanel, ActionFeedback                             |

Website-login presentations are available for gallery review. Browser capture
and Fill capabilities are not supplied by this build. Current entry fields are login,
password, URL, one folder ID and multiple tag IDs. Notes, custom titles and
favorites remain outside the current entry contract. Organization reads and
writes use injected core use cases; React does not read repositories directly.
See [current core workflows](../core/workflows.md).

## Exact visual foundation

The official decoder was fetched at a pinned revision and round-trip checked:
`encodePreset(decodePreset("b2CjQp4R0")) === "b2CjQp4R0"`.
See [R07](./references.md#r07-shadcn-preset-and-components).

| Setting      | Value                               |
| ------------ | ----------------------------------- |
| Style        | Mira, using the Base UI variant     |
| Base color   | Mauve                               |
| Theme accent | Violet                              |
| Font         | Figtree                             |
| Heading font | Inherit                             |
| Icons        | Hugeicons                           |
| Radius       | Style default                       |
| Menu color   | Default translucent                 |
| Menu accent  | Subtle                              |
| Chart color  | Emerald; not a reason to add charts |

The primitive implementation is selected separately from the preset. Retain Base
UI and Tailwind 4. Use the supplied style tokens rather than inventing replacement
colors or interpreting "default" radius as zero. Typography, control spacing and
responsive layouts still need review in both themes.

### Implementation status

The shadcn 4.21.0 CLI applied the exact preset after dependency approval.
`preset resolve --json` returns `b2CjQp4R0` without fallbacks. All 38 base controls,
31 presentation families, seven forms and five screen compositions now have
interactive gallery examples.
Figtree and Hugeicons replace DM Sans and Phosphor. AGENTS.md and UI-003 agree.
The [review inventory](./review-inventory.md) distinguishes shared controls,
feature widgets and shell compositions. Full visual approval remains pending.

See the [gallery implementation notes](../../apps/extension/src/gallery/README.md)
for CLI commands, generation exceptions and managed preview instructions.

## Complete component specification

The [build specification](./component-specification.md) is the source of truth
for the complete component catalog, shadcn/custom mapping, presentation APIs,
variants, sizes, states, accessibility and gallery acceptance.

It replaces the earlier setup-only shortlist and the suggestion to defer menus,
selection controls, sync/device presentation and other library work until their
screens are built. The required order is now explicit: complete the planned
library and gallery, then assemble screens, then integrate application workflows.

The catalog now covers 38 base controls, 31 presentation families, seven forms and
five screen compositions.
The [full reuse audit](./shadcn-reuse-audit.md) preserves the catalog-wide research;
the [review inventory](./review-inventory.md) records subsequent implementation and
library decisions. Families can share code and expose related parts. Feature-owned
widgets stay within their slices and export explicit public APIs.

## Visual and implementation boundaries

Mobbin screens are interaction references, not the approved visual target. The
user found their appearance insufficiently polished. Use the exact Mira preset
and review the actual component library's typography, spacing and presentation.

The core supplies only a strength score, not reasons or a checklist of required
character classes. Vault display names are generated by core. Password recovery,
device management and organization settings are connected through composed
capabilities. Complete disaster-recovery archives and browser-login capture/Fill
runtime capabilities remain outside the current implementation.

The component gallery is development-only and uses synthetic data. Its full state
matrix and completion gate are in the specification. Connected screens use the
same production components and must update the gallery when their APIs change.
