# Extension UI and UX plan

Status: accepted product decisions with proposed layouts and implementation work.
Checked on 2026-09-05 against commit `8ec2614860506318a2c1b0610d3c33518ee761eb`.
These documents describe the intended experience; they do not claim that the UI
or missing core capabilities have been implemented. Coding rules remain in
[the standards](../standards/README.md).

The complete gallery is now implemented for review. Start with the
[component review inventory and ownership map](./review-inventory.md) and the
[TanStack verification report](./tanstack-verification.md). See also the
[component contrast review](./contrast-review.md) and
[website icon plan and safety review](./favicon-review.md). Screens and live
workflows still follow library review.

## Read in this order

1. [Component-library build specification](./component-specification.md): full
   shadcn/custom catalog, presentation contracts, states, gallery evidence and build checklist.
2. [Screen and component inventory](./component-library.md): whole-extension scope
   and the exact visual preset.
3. [Vault setup flow](./vault-setup.md): screen sequence, copy, recovery handling,
   failure paths, and acceptance criteria.
4. [Mobbin reference board](./mobbin.md): five locally attached, visually reviewed
   screens, with what to adopt and what differs from this product.
5. [Frontend architecture](./frontend-architecture.md): feature slices, popup and
   options composition, state ownership, and implementation order.
6. [Verified sources](./references.md): primary references, checked claims,
   limitations, and repository evidence.

The [full shadcn reuse audit](./shadcn-reuse-audit.md) covers all 64 official
component entries, the two additional registry UI names, block categories, and
mappings for every planned product family and form. It corrects the initial
20-control shortlist and recommends the next eight upstream additions.

## Product intent

Give people a complete password manager on the extension's options page, with
quick access in the popup. Build the complete planned component library and gallery
first, then assemble first-vault setup. Explain
security-sensitive actions at the point of use and provide enough space to read,
save recovery information, and correct mistakes. Component batches order the
library's dependencies; they do not defer non-setup components until after screens.

## Decision register

| ID  | Decision                                                                                   | Evidence and status                                                                                                            |
| --- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| D01 | Setup lives entirely on the existing options page.                                         | User confirmed, 2026-09-04 23:25 UTC.                                                                                          |
| D02 | With no local vault, popup shows **Set up vault**, which opens options.                    | User confirmed, 2026-09-04 23:50 UTC.                                                                                          |
| D03 | Options offers creation and connection to an existing vault.                               | Working baseline inferred from the supported journeys; user rejected asking this as an unnecessary question, 23:57 UTC.        |
| D04 | Options supports the full application; popup provides quick actions.                       | User confirmed, 23:57 UTC, conditional on appropriate security. The browser-context rationale is in the architecture document. |
| D05 | Use preset `b2CjQp4R0` exactly, including Hugeicons.                                       | User confirmed, 23:26 UTC. CLI migration applied; code and UI-003 now use Hugeicons.                                           |
| D06 | Follow system theme with a saved override; suggest an editable device name.                | User confirmed, 23:57 UTC. Use a neutral fallback if environment detection is unavailable.                                     |
| D07 | Require master-password confirmation and reveal controls.                                  | User confirmed, 23:57 UTC. No claim that confirmation proves memorization.                                                     |
| D08 | Verify three random recovery-word positions using the saved copy.                          | User confirmed, 23:59 UTC. Distinct positions and stable retries are proposed details.                                         |
| D09 | Offer optional S3 setup after local vault setup.                                           | User confirmed, 23:57 UTC.                                                                                                     |
| D10 | Review components in a development-only gallery.                                           | User confirmed, 23:57 UTC. Include themes and interaction states.                                                              |
| D11 | Provide copy and multiple recovery export formats with clear safety guidance.              | User requested, 2026-09-05 00:07 UTC. PDF, TXT and print are the proposed set; implementation safety remains to be validated.  |
| D12 | Default lock duration is 10 minutes, editable during setup and later, local to the device. | User confirmed, 00:07 UTC. Inactivity semantics and preference persistence are not yet approved or implemented.                |
| D13 | Research step layout and the post-setup destination.                                       | User requested, 00:07 UTC. The guided sequence and empty-vault landing are recommendations, not measured usability results.    |
| D14 | Define a frontend architecture using feature-based slices or a suitable equivalent.        | User requested during documentation work. The architecture document is the proposed adaptation.                                |

Later user clarifications supersede the initial setup-first implementation order:

- **D15:** Mobbin references inform individual interactions, not the desired visual
  finish. The library should establish a more polished and cohesive look.
- **D16:** Complete the component specification, apply the preset, and build/review
  all planned library components before screen assembly and live workflow integration.
  The user explicitly corrected the earlier ordering and authorized this specification.

- **Contrast requirement:** Component contrast must meet WCAG AA thresholds in
  both themes. The [contrast review](./contrast-review.md) records the measured
  accessibility overrides to the base preset and the repeatable gallery audit.
- **Website icons:** Add `SiteIcon` to the entries-library work; defer browser
  permissions and the device-local preference workflow until entries/settings
  integration. Real-extension verification gates shipping. The user accepted
  this staging; the [favicon plan](./favicon-review.md#planned-work-and-implementation-triggers)
  records the pending deliverables. No new core vault service is planned.
- **No subtitles:** Product headings have no subtitles, eyebrow slogans or footer
  taglines. Keep task labels, field errors and necessary safety information; put
  longer help behind a relevant disclosure. This user preference is recorded in
  [UI-007](../standards/react-and-ui.md#ui-007-no-product-subtitles-or-filler-copy).
- **Ongoing gallery coverage:** The user accepted the current library direction
  and requires every application component and supported variant to stay
  reviewable as the application grows. [UI-006](../standards/react-and-ui.md#ui-006-keep-the-component-gallery-current)
  makes gallery updates part of every component change. The
  [coverage follow-up](./component-specification.md#ongoing-catalog-and-variant-coverage)
  is complete, with source-derived membership, variant choosers and browser
  verification. The Options page now runs live new-vault creation, recovery saving,
  verification, and authenticated recovery replacement after interruptions. See
  [the implemented setup flow](./vault-setup.md).

## Unresolved work that affects the experience

| Gap                         | Why it matters                                                                 | Proposed next action                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Complete disaster recovery  | Words alone cannot restore a lost installation.                                | Define backup artifacts and import verification separately; do not label a word sheet a full vault backup. |
| UI integration              | Composition exists, but entrypoints do not call it.                            | Inject narrow use-case capabilities into feature controllers.                                              |
| Later settings/read screens | Device, tag, and configuration summaries lack dedicated public read workflows. | Add explicit read contracts when those slices are implemented.                                             |

## Delivery sequence

1. Complete the full [component specification](./component-specification.md).
2. Apply the exact preset, align aliases/icon conventions, and create the gallery.
3. Build all base controls, product-component families and reusable forms in the
   specification. Review their states in the gallery using synthetic data.
4. Assemble screens from the reviewed library, starting with vault setup.
5. Connect composed use cases after their contracts are ready. Resolve recovery
   continuation, export and local lock behavior before shipping the setup flow.

The authorized library implementation now includes CLI-generated controls and
Table 9.2.4. New-vault setup now connects to the core use cases. The component gallery can
proceed independently of unresolved recovery contracts; production setup cannot.
