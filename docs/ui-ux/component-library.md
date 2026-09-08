# Screen and component inventory

Status: accepted product scope and visual preset; proposed component decomposition.
See the [decision register](./README.md#decision-register) and
[verified sources](./references.md).

## Application map

Options is the full application. Popup renders compact versions of quick workflows
from the same feature slices. Opening options uses the existing extension page;
there is no separate setup application or externally hosted vault UI.

| Feature        | Options experience                                                             | Popup experience                                  | Shared product components                                                 |
| -------------- | ------------------------------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------- |
| Setup          | Create or connect; password; device settings; recovery save and verification   | No-vault state and Set up vault action            | SetupLayout, StepNavigation, SafetyHelp                                   |
| Vault access   | Vault selection, unlock, locked-session screen                                 | Vault selection, unlock, lock                     | VaultPicker, UnlockForm, PasswordField                                    |
| Entries        | Browse, search, view, add, edit, remove                                        | Compact browsing and editing, reveal and copy     | EntryList, EntryRow, EntryForm, SecretField, EmptyVault                   |
| Password tools | Password and username generation                                               | Standalone tools or controls within entry editing | GeneratorControls, GeneratedValue                                         |
| Sync           | S3 configuration, review, explicit resolutions, disable and credential cleanup | Status and actions that can hand off to review    | SyncStatus, SyncReview, ComparisonRow, CredentialForm                     |
| Devices        | Enrollment request/approval/import, revocation, transition review              | Link to device management and relevant status     | DeviceSummary, TransferInput, TransferOutput, ReviewSummary               |
| Recovery       | Recover existing local device access; save replacement words                   | Open the options recovery route                   | RecoveryPhraseGrid, RecoveryWordInput, RecoveryVerification               |
| Settings       | Theme, local lock preference, local master-password change, local deletion     | Theme/lock shortcuts as needed                    | SettingsSection, ThemeControl, LockDurationField, DestructiveConfirmation |
| Autofill       | Configuration and guidance when implemented                                    | Select a matching entry and fill                  | EntrySelection, ActionFeedback                                            |

Autofill runtime integration is future work. Current entry fields are login,
password, URL and tag IDs. Notes, custom titles, favorites and folders are not
supported by the current entry contract. Device and organization read workflows
still need explicit contracts; none of these gaps should be filled by React reading
internal repositories. See [current core workflows](../core/workflows.md).

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
28 presentation families and seven forms now have interactive gallery examples.
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

The catalog now covers 38 base controls, 28 presentation families and seven forms.
The [full reuse audit](./shadcn-reuse-audit.md) preserves the catalog-wide research;
the [review inventory](./review-inventory.md) records subsequent implementation and
library decisions. Families can share code and expose related parts. Feature-owned
widgets stay within their slices and export explicit public APIs.

## Visual and implementation boundaries

Mobbin screens are interaction references, not the approved visual target. The
user found their appearance insufficiently polished. Use the exact Mira preset
and review the actual component library's typography, spacing and presentation.

The core supplies only a strength score, not reasons or a checklist of required
character classes. Vault display names are generated by core. Password recovery and
device/organization settings remain integration gaps; gallery fixtures allow the
complete presentation library to be built without pretending those operations exist.

The component gallery is development-only and uses synthetic data. Its full
state matrix and completion gate are in the specification. Screen assembly begins
only after the entire planned library has been built and reviewed.
