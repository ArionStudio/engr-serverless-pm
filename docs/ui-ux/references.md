# Verified UI and UX sources

Checked on **2026-09-05**. Verification includes opening the source and checking
that its actual content supports the attributed claim, not merely that a search
result mentions it. Repository claims were checked against commit
`8ec2614860506318a2c1b0610d3c33518ee761eb`. Mobbin images were inspected visually
and downloaded; their integrity metadata is in the
[asset manifest](./assets/mobbin/manifest.json).

A separate reachability pass returned HTTP 200 for all 35 external source URLs in
this register, including the expanded component catalog. That complements the
content checks below; status codes alone do not establish that a source supports
a claim.

External guidance informs this design. It does not prove that our particular flow
is optimal or that an implementation is secure. Proposed adaptations and gaps are
identified in the [setup flow](./vault-setup.md) and
[architecture](./frontend-architecture.md).

## R01: logical steps and accessibility

[W3C WAI: Multi-page Forms](https://www.w3.org/WAI/tutorials/forms/multi-page/).

Verified the Overview and Indicating progress sections. They recommend grouping
long forms into logical stages, explaining progress, identifying optional stages
and accommodating necessary time limits. This supports our step structure and
accessible navigation. It does not prescribe this application's exact number of
steps or permit saving plaintext recovery drafts for convenience.

## R02: focused question pages

[GOV.UK Design System: Question pages](https://design-system.service.gov.uk/patterns/question-pages/).

Verified guidance on asking only necessary questions, starting with one question
per page, clear headings, Continue and Back navigation, and sensible back behavior
after an action that should not be repeated. This supports focused tasks and the
explicit creation boundary. It is general service-design guidance, not a password
manager benchmark. The password and confirmation fields remain one logical task.

## R03: recovery downloads

[1Password: Get to know your Emergency Kit](https://support.1password.com/emergency-kit/).

Verified that the kit is a PDF, is offered during account creation, can be downloaded
again in that product, and has printing/storage instructions. We adopt the explicit
download and instructional pattern. Its account model, ability to re-download,
cloud-storage advice and inclusion of other sign-in details do not establish the
appropriate behavior for LFSPM. Our recovery semantics are defined by R10.

## R04: vault landing

[Bitwarden: Password Manager Web App](https://bitwarden.com/help/getting-started-webvault/).

Verified the introductory All vaults landing and First steps / Add a login sections.
They support entering an actionable vault view after authentication. This is
precedent for our empty-state design, not evidence that recovery verification,
session checks or safe secret handling can be skipped.

## R05: clipboard behavior

[Microsoft: Using the clipboard](https://support.microsoft.com/en-us/windows/apps/using-the-clipboard).

Verified clipboard history, pinning and optional cross-device synchronization.
The distinction between clearing a current clipboard value and removing history
supports honest copy-action guidance. This source describes Windows, not every
operating system; avoid claiming all users have history or sync enabled.

## R06: Chrome extension boundaries

- [Manifest content security policy](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy):
  verified that extension-page policy covers popup, workers and extension HTML
  tabs. Our manifest applies a shared policy to the extension's pages.
- [Give users options](https://developer.chrome.com/docs/extensions/develop/ui/options-page):
  verified options-page registration and `chrome.runtime.openOptionsPage()`.
- [Stay secure](https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure):
  verified warnings about content-script trust, sender validation and sensitive
  data crossing into page-adjacent contexts.

Inference for this project: full options functionality is compatible with Chrome's
extension model. Neither a popup nor a tab is automatically secure; permissions,
rendering, exposed messages and session lifetime still need validation. The existing
factory supports trusted extension contexts; any later move to worker-only workflow
execution should be designed explicitly rather than smuggled into UI organization.

## R07: shadcn preset and components

[Official preset decoder, pinned source](https://github.com/shadcn-ui/ui/blob/7c9eaba1c0a6404c990c144a654792e3313c650d/packages/shadcn/src/preset/preset.ts).

Fetched that TypeScript source and ran its `decodePreset` and `encodePreset`
functions locally with Node's type stripping, without installing packages. The
round trip reproduced `b2CjQp4R0`; the full decoded settings are recorded in the
[component inventory](./component-library.md#exact-visual-foundation).

[Official CLI documentation](https://ui.shadcn.com/docs/cli) was checked for preset
commands and base selection. The current documentation is newer than this repo's
installed CLI; no generator command was run on the project.

Base UI component pages checked for the proposed controls:

- [Button](https://ui.shadcn.com/docs/components/base/button)
- [Field](https://ui.shadcn.com/docs/components/base/field)
- [Input Group](https://ui.shadcn.com/docs/components/base/input-group)
- [Native Select](https://ui.shadcn.com/docs/components/base/native-select)
- [Accordion](https://ui.shadcn.com/docs/components/base/accordion)
- [Alert Dialog](https://ui.shadcn.com/docs/components/base/alert-dialog)
- [Spinner](https://ui.shadcn.com/docs/components/base/spinner)

These establish available building blocks, not accessibility conformance of our
assembled screens. Keep Base UI selected; similarly named Radix examples are not
substitutes. Exact preset adoption does not require adding unused charts or menus.

## R08: frontend organization

[Feature-Sliced Design: Slices and segments](https://feature-sliced.design/docs/reference/slices-segments).
Cross-checked the substantive guidance against the
[pinned official repository source](https://github.com/feature-sliced/documentation/blob/4ef2ea9c5dd45b963e3d7742dfad81874a7bf818/src/content/docs/docs/reference/slices-segments.mdx).
Verified organization by product meaning, cohesive independent slices and explicit
public exports. The site's edit link pointed at an older path; the source above
uses the verified current path. Unrelated page-footer links were not used as evidence.

[React: Sharing State Between Components](https://react.dev/learn/sharing-state-between-components).
Verified lifting state to a common owner and passing values/actions through props.
This informs local presentation-state ownership; it does not make Context a
cross-window synchronization mechanism.

Our feature layout is an adaptation. It retains the repository's core/adapters/
composition boundaries and does not adopt every FSD layer or naming rule.

## R09: Crypto 101

Laurens Van Houtven, [Crypto 101 PDF](https://github.com/crypto101/crypto101.github.io/raw/master/Crypto101.pdf).

Downloaded locally to `~/.cache/lfspm-references/Crypto101.pdf`; text extraction is
beside it as `Crypto101.txt`. The PDF is 223 pages; its metadata reports creation
on 2020-09-25. The book credits copyright 2013–2017 and CC BY-NC 4.0. The full
book is kept outside the repository; the external link and digest identify the
reference without adding a large third-party binary to the docs.

SHA-256: `527c06ac5a3e3c8f997327e76b7fa5f29caff689c55b44d7b049b77b0f209503`.

Reviewed the introduction on printed pages 10–11 and key-derivation discussion
on pages 137–139. The distinction between password-derived and high-entropy key
material is useful conceptual background. Section 13.2, Password strength, is a
TODO in this copy. It is not evidence for a current password policy, a recovery
export format, or the best onboarding sequence. Current algorithms and parameters
remain owned by the repository's active contracts.

## R10: repository contracts

| Claim checked                                                                                                                            | Owning source                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initialization needs master password, device name and lock duration; returns generated display name and recovery words after activation. | [InitializeVault](../../packages/core/src/use-cases/vault-lifecycle/initialize-vault.ts)                                                                                                            |
| Word count is 24 in the active suite.                                                                                                    | [Algorithm suite](../../packages/core/src/domain/crypto/algorithm-suite.const.ts)                                                                                                                   |
| New master password must receive score 4; UI cannot invent additional requirements.                                                      | [Master-password policy](../../packages/core/src/domain/master-password/master-password.utils.ts), [strength use case](../../packages/core/src/use-cases/password-tools/check-password-strength.ts) |
| Supported lock choices are 1, 5, 10, 30 and 60 minutes.                                                                                  | [Delay schema](../../packages/core/src/domain/scheduled-task/scheduled-task-delay.schema.ts)                                                                                                        |
| Timer currently uses activation time plus the chosen delay.                                                                              | [Session activation](../../packages/core/src/services/session/vault-session-activation.service.ts)                                                                                                  |
| Recovery words require local recovery records and replace the current backup when recovery is performed.                                 | [RecoverDeviceAccess](../../packages/core/src/use-cases/device-trust/recover-device-access.ts), [security model](../core/security-model.md#local-access-and-recovery)                               |
| Original-phrase retrieval, recovery export and local lock-preference operations are not exposed.                                         | [Composed application](../../apps/extension/src/extension/composition/extension-application.ts), [core workflow inventory](../core/workflows.md)                                                    |
| Existing copy command targets an entry password and owns cleanup scheduling.                                                             | [CopyEntryPassword](../../packages/core/src/use-cases/clipboard/copy-entry-password.ts)                                                                                                             |
| Current session status exposes locked or active vault ID, not a complete settings read model.                                            | [Session status](../../packages/core/src/use-cases/session/get-vault-session-status.ts)                                                                                                             |
| Entry inputs contain login, URL, password and tag IDs.                                                                                   | [AddEntry contract](../../packages/core/src/use-cases/vault-entries/add-entry.ts)                                                                                                                   |
| Popup/options are separate entrypoints, currently showing placeholder/theme UI.                                                          | [Popup root](../../apps/extension/src/extension/popup/popup.tsx), [options root](../../apps/extension/src/extension/options/options.tsx), [manifest](../../apps/extension/config/manifest.json)     |
| Current styles and generator aliases differ from the chosen target preset.                                                               | [components.json](../../apps/extension/components.json), [CSS](../../apps/extension/src/ui/styles/index.css), [cn helper](../../apps/extension/src/ui/lib/cn.util.ts)                               |
| Core owns workflows; UI invokes composed use cases; Zustand is not mandatory.                                                            | [React/UI standards](../standards/react-and-ui.md), [core architecture standards](../standards/core-architecture.md)                                                                                |

Descriptions in old academic reports and the legacy security specification were
not promoted over current code. Where a desired behavior lacks a public contract,
the plan records a gap instead of asserting that it already works.

## R11: Mobbin evidence

The [Mobbin board](./mobbin.md) contains canonical links, local attachments,
observations and adaptation limits for M01–M05. The images were checked against
their returned app/platform metadata. Search wording alone was not treated as
evidence. These screens inform layout and interaction; they do not define LFSPM's
recovery protocol, cryptographic policy or final visual theme.

## R12: component-library specification

The [component build specification](./component-specification.md) expands the
earlier setup shortlist to the full planned library. These official Base UI
component pages were checked for the corresponding building blocks. Variants,
keyboard examples and component composition inform the catalog; custom product
contracts and fixture requirements are this project's design, not claims made by shadcn.

| Catalog ID | Official component reference                                              |
| ---------- | ------------------------------------------------------------------------- |
| B01        | [Button](https://ui.shadcn.com/docs/components/base/button)               |
| B02        | [Field](https://ui.shadcn.com/docs/components/base/field)                 |
| B03        | [Input](https://ui.shadcn.com/docs/components/base/input)                 |
| B04        | [Input Group](https://ui.shadcn.com/docs/components/base/input-group)     |
| B05        | [Textarea](https://ui.shadcn.com/docs/components/base/textarea)           |
| B06        | [Native Select](https://ui.shadcn.com/docs/components/base/native-select) |
| B07        | [Checkbox](https://ui.shadcn.com/docs/components/base/checkbox)           |
| B08        | [Radio Group](https://ui.shadcn.com/docs/components/base/radio-group)     |
| B09        | [Slider](https://ui.shadcn.com/docs/components/base/slider)               |
| B10        | [Alert](https://ui.shadcn.com/docs/components/base/alert)                 |
| B11        | [Badge](https://ui.shadcn.com/docs/components/base/badge)                 |
| B12        | [Spinner](https://ui.shadcn.com/docs/components/base/spinner)             |
| B13        | [Skeleton](https://ui.shadcn.com/docs/components/base/skeleton)           |
| B14        | [Accordion](https://ui.shadcn.com/docs/components/base/accordion)         |
| B15        | [Tooltip](https://ui.shadcn.com/docs/components/base/tooltip)             |
| B16        | [Dropdown Menu](https://ui.shadcn.com/docs/components/base/dropdown-menu) |
| B17        | [Alert Dialog](https://ui.shadcn.com/docs/components/base/alert-dialog)   |
| B18        | [Separator](https://ui.shadcn.com/docs/components/base/separator)         |
| B19        | [Dialog](https://ui.shadcn.com/docs/components/base/dialog)               |
| B20        | [Tabs](https://ui.shadcn.com/docs/components/base/tabs)                   |

[W3C: Understanding Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
was checked for the 24 CSS pixel target-size criterion and its spacing/other
exceptions. The specification's 44px major-action hit-area goal is our usability
target, not a claim that this criterion requires every control to be 44px.

Additional code checks for form/control scope:

- [Password generator settings](../../packages/core/src/lib/generate-password/generated-password.schema.ts)
  and [username generator settings](../../packages/core/src/lib/generate-username/generated-username.schema.ts)
  establish the available generator fields; components do not invent additional rules.
- [S3 adapter](../../apps/extension/src/adapters/sync/aws-s3-sync-provider.adapter.ts)
  establishes bucket, region, prefix, access-key ID and secret-access key. Its strict
  configuration parsing does not support an arbitrary endpoint or session-token field.
- [Visible review items](../../packages/core/src/domain/sync/entry-review.type.ts)
  and [resolution choices](../../packages/core/src/domain/sync/vault-sync-item-review.type.ts)
  establish password-free comparison data and `use_local` / `use_remote` choices.
- [Upload result](../../packages/core/src/domain/sync/sync-upload-status.type.ts)
  supplies complete/pending. Other displayed activity/error states need explicit
  context from the feature controller and cannot be inferred from that union alone.

Current source-file links here are evidence for implementation planning, not
authorization for UI to import internal modules. Use supported public contracts
or add an appropriate boundary during integration.

## R13. Full shadcn reuse audit

Checked 2026-09-05: the [official component catalog](https://ui.shadcn.com/docs/components),
all 64 linked Base UI documentation pages in their Markdown representation, and
[the Mira registry](https://ui.shadcn.com/r/styles/base-mira/registry.json).
The [audit](./shadcn-reuse-audit.md) links each component and records our fit decision.
Its [evidence inventory](./shadcn-catalog-audit.json) records source hashes and
registry dependency metadata. Recommendations are project judgments; availability
is not a claim of installed-version compatibility or completed accessibility review.

The registry-only `form` and `sonner` items and Sidebar source were fetched
separately. The official blocks were inventoried by group; representative displayed
examples were inspected, not all block implementations. The CLI dry run verified
the eight proposed additions without changing files or installing packages.

## R14: library ownership and verified dependency decisions

Checked again on 2026-09-05:

- [FSD layers](https://feature-sliced.design/docs/reference/layers#widgets) describes
  widgets as substantial independent UI blocks and allows unused layers to be
  omitted. The repository-specific placement proposal is recorded in the
  [ownership map](./review-inventory.md#what-belongs-where), not attributed to FSD
  as an exact folder convention.
- [FSD public APIs](https://feature-sliced.design/docs/reference/public-api) supports
  explicit slice entrypoints. New feature presentations export named APIs; the
  gallery composes those APIs without peer-feature imports.
- [shadcn Base UI Data Table](https://ui.shadcn.com/docs/components/base/data-table)
  currently uses TanStack Table v9 and provides application-specific composition
  guidance over Table. P11 implements the corresponding table behavior with the
  approved display-field projection.
- The [TanStack artifact verification](./tanstack-verification.md) supplies pinned
  source evidence and executable reproductions for the Form decision. It is the
  source for excluding the inspected Form 1.33.5 unchanged from secret-bearing
  forms; absence of a published advisory is not treated as a safety guarantee.
