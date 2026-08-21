# Findings 11–28: Re-audit and Work-Packet Index

Baseline: `main` at `be9f3df` on 2026-08-02.

Source: [`review-result-2026-07-12.md`](../../../review-result-2026-07-12.md).

This directory converted the historical findings into implementation-ready work
packets. The original status text was based on `main` at the baseline above.
These documents preserve the plans and verification instructions used for the
implementation work.

## Post-implementation status

Status reviewed on 2026-08-21 against `main` at `07caa03c`.

All implementation work items in this packet have been completed and audited.
Work item 24 remains an accepted product limitation under the documented threat
model, rather than an unresolved implementation defect. The tables and work
splits below preserve the 2026-08-02 planning baseline and should not be read as
the current implementation status.

| Work item | Current status      | Closure evidence                                                                                                                                                                                                                                                               |
| --------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 11        | Resolved            | Lifecycle rollback, cleanup ownership, activation serialization, and secret wiping are implemented and covered by regression tests.                                                                                                                                            |
| 12        | Resolved            | New and replacement master passwords require the current local calculator's maximum score of 4/4.                                                                                                                                                                              |
| 13        | Resolved            | PRs [#88](https://github.com/ArionStudio/engr-serverless-pm/pull/88) and [#91](https://github.com/ArionStudio/engr-serverless-pm/pull/91) completed atomic clipboard coordination and the production offscreen bridge. See [the closure record](03-clipboard-coordination.md). |
| 15        | Verified resolved   | The exact signed snapshot handoff was confirmed in production code and tests.                                                                                                                                                                                                  |
| 16        | Resolved            | The stable core service package API and extension composition contract are implemented.                                                                                                                                                                                        |
| 17        | Resolved            | Vault-bound descriptors and explicit upload outcomes are implemented, including Finding 19.                                                                                                                                                                                    |
| 18        | Verified resolved   | Append-only trust history was confirmed in the merged implementation.                                                                                                                                                                                                          |
| 20        | Resolved            | The contract inventory and hostile-boundary decoders are complete, including Finding 28.                                                                                                                                                                                       |
| 22        | Resolved            | Device access material is bound to the expected vault and device identities.                                                                                                                                                                                                   |
| 24        | Accepted limitation | Recovery replaces local access material but cannot revoke retained old backups or recovery words without a trusted external authority.                                                                                                                                         |
| 25        | Resolved            | URL parse failures no longer expose secret-bearing input.                                                                                                                                                                                                                      |
| 26        | Resolved            | Type-only imports comply with `verbatimModuleSyntax`.                                                                                                                                                                                                                          |
| 27        | Resolved            | Generated username words cannot normalize to the same value.                                                                                                                                                                                                                   |

## Single-number resolution units

Use the **work item number**, not every historical finding number, when opening
a resolution thread. One work item contains every finding that has a hard
prerequisite or shared owner preventing honest standalone closure. Completing an
early slice does not close the work item; all included findings must meet their
acceptance criteria.

| Work item number | Included findings | Required packets                                                                                                                               | Required order                                                        |
| ---------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **11**           | 11, 21, 23        | [Session lifecycle](01-session-lifecycle.md), [secret wipe ownership](09-secret-wipe-ownership.md)                                             | 21 cleanup owner → 11 activation policy/auto-lock → 23 wipe ownership |
| **12**           | 12                | [Master-password policy](02-master-password-policy.md)                                                                                         | Standalone                                                            |
| **13**           | 13, 14            | [Clipboard coordination](03-clipboard-coordination.md)                                                                                         | 14 failure isolation → 13 atomic cross-layer coordination             |
| **15**           | 15                | [Closure verification](14-resolved-findings-verification.md)                                                                                   | Verification only                                                     |
| **16**           | 16                | [Core package API](04-core-package-api.md)                                                                                                     | Standalone                                                            |
| **17**           | 17, 19            | [Descriptor vault identity](06-snapshot-descriptor-vault-identity.md), [remote upload outcomes](05-remote-upload-outcomes.md)                  | 19 vault-bound descriptors → 17 outcome-unknown upload contract       |
| **18**           | 18                | [Closure verification](14-resolved-findings-verification.md)                                                                                   | Verification only                                                     |
| **20**           | 20, 28            | [Contract source-of-truth research](13-contract-source-of-truth-research.md), [runtime boundary validation](07-runtime-boundary-validation.md) | 28 inventory → 20 boundary inventory/design → ordered artifact slices |
| **22**           | 22                | [Device-access identity](08-device-access-identity.md)                                                                                         | Standalone                                                            |
| **24**           | 24                | [Recovery-word semantics](10-recovery-word-semantics.md)                                                                                       | Decision-gated standalone unit                                        |
| **25**           | 25                | [URL error redaction](11-url-error-redaction.md)                                                                                               | Standalone                                                            |
| **26**           | 26                | [Small independent fixes](12-small-independent-fixes.md)                                                                                       | Standalone; only the Finding 26 section                               |
| **27**           | 27                | [Small independent fixes](12-small-independent-fixes.md)                                                                                       | Standalone; only the Finding 27 section                               |

Historical Findings **14, 19, 21, 23, and 28 are not separate work item
numbers**. Select their canonical work item number from the table instead. A
packet may still prescribe multiple independently reviewable commits or PRs;
that is delivery sequencing inside one resolution unit, not permission to close
only the first slice.

## Baseline per-finding status map

The following table records the status before implementation began on
2026-08-02. Use the post-implementation table above for current status.

| Finding | Work item | Current status                                                     | Work packet                                                                  |
| ------- | --------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| 11      | 11        | Open; behavior decision required                                   | [Session lifecycle](01-session-lifecycle.md)                                 |
| 12      | 12        | Open                                                               | [Master-password policy](02-master-password-policy.md)                       |
| 13      | 13        | Open; requires core and real-adapter coordination                  | [Clipboard coordination](03-clipboard-coordination.md)                       |
| 14      | 13        | Partially mitigated; cleanup can still be skipped                  | [Clipboard coordination](03-clipboard-coordination.md)                       |
| 15      | 15        | Resolved in current code; closure verification remains             | [Closure verification](14-resolved-findings-verification.md)                 |
| 16      | 16        | Open                                                               | [Core package API](04-core-package-api.md)                                   |
| 17      | 17        | Open; requires provider and workflow contract changes              | [Remote upload outcomes](05-remote-upload-outcomes.md)                       |
| 18      | 18        | Resolved by the trust-chain redesign; closure verification remains | [Closure verification](14-resolved-findings-verification.md)                 |
| 19      | 17        | Open prerequisite for Finding 17                                   | [Descriptor vault identity](06-snapshot-descriptor-vault-identity.md)        |
| 20      | 20        | Partially addressed; requires ordered hostile-boundary slices      | [Runtime boundary validation](07-runtime-boundary-validation.md)             |
| 21      | 11        | Open prerequisite/shared cleanup owner for Findings 11 and 23      | [Session lifecycle](01-session-lifecycle.md)                                 |
| 22      | 22        | Partially addressed in unlock/recovery                             | [Device-access identity](08-device-access-identity.md)                       |
| 23      | 11        | Open; depends on Finding 21 cleanup ownership                      | [Secret wipe ownership](09-secret-wipe-ownership.md)                         |
| 24      | 24        | Accepted limitation unless the product contract changes            | [Recovery-word semantics](10-recovery-word-semantics.md)                     |
| 25      | 25        | Open                                                               | [URL error redaction](11-url-error-redaction.md)                             |
| 26      | 26        | Open                                                               | [Small independent fixes](12-small-independent-fixes.md)                     |
| 27      | 27        | Open                                                               | [Small independent fixes](12-small-independent-fixes.md)                     |
| 28      | 20        | Open research prerequisite for Finding 20                          | [Contract source-of-truth research](13-contract-source-of-truth-research.md) |

## Recommended execution order

### Wave 1: narrow independent work items

Most can be implemented in parallel because they have distinct owners; the two
explicit lifecycle exceptions remain sequential:

1. Work item 25 — remove secret-bearing URL parse errors.
2. Work item 26 — correct type-only imports.
3. Work item 27 — remove normalized username-word duplication.
4. Work item 16 — expose the established service layer through one stable package
   subpath.
5. Work items 12 and 22 — each is standalone, but run them sequentially because
   they overlap lifecycle contracts.
6. Work items 15 and 18 — verification only.

### Wave 2: decisions and research

These can be investigated in parallel, but do not begin their broad
implementations until each packet's decision gate is settled:

1. Begin work item 20 with Finding 28's contract/source-of-truth inventory,
   then use it for Finding 20's boundary inventory and implementation slices.
2. Work item 17 — first bind descriptors under Finding 19, then define definite
   non-commit versus outcome-unknown remote writes under Finding 17.
3. Begin work item 11 with Finding 21's cleanup owner; complete Finding 23 only
   after the lifecycle owner is stable.
4. Work item 24 — decide whether recovery rotation is only local backup
   replacement or a new trust transition.

The Finding 28 phase of work item 20 should precede signature-heavy refactors in
work items 17 and 20 so the same contracts are not redesigned twice. This is a
cross-item scheduling constraint, not a reason to merge work items 17 and 20.

### Wave 3: overlapping lifecycle work

Run these sequentially because they touch the same use cases and invariants:

1. Complete work items 12 and 22 sequentially if they were not handled in Wave
   1.
2. Work item 11 — centralize cleanup under Finding 21, resolve Finding 11's
   activation policy and auto-lock behavior, then implement Finding 23 wiping at
   the final cleanup/session owners.

### Wave 4: clipboard work

1. Work item 13 starts by fixing Finding 14's failure isolation.
2. Define and implement Finding 13's atomic coordinator in core and the target
   adapter.
3. Add controlled-interleaving tests after both behaviors share the final
   ownership model.

## Rules for every implementation branch

- Re-read the packet and current code; line numbers are evidence locations, not
  immutable APIs.
- Make the smallest change at the established owner. Do not duplicate
  validation or cleanup at every caller.
- Add the smallest regression test that fails without the fix.
- Run targeted Vitest files first, then `pnpm core:type-check`. Run the full core
  suite for port, session, snapshot, trust, or sync contract changes.
- Inspect the final diff for unrelated refactors and widened public surface.
- Close a finding only when its observable acceptance criteria pass. A type
  check alone does not close concurrency, rollback, or secret-handling issues.

## Global stopping point

Stop a work item only when every included finding meets its packet acceptance
criteria, or when a documented decision/external prerequisite genuinely blocks
the next ordered slice. Do not pull in a different work item merely because it
touches neighboring code.
