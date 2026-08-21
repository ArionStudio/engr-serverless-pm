# Research Packet: Core Contract Sources of Truth

Finding: 28.

Resolution unit: **work item 20**. This research is the first required slice;
continue with Finding 20 in the companion
[runtime-boundary packet](07-runtime-boundary-validation.md). Completing the
inventory alone does not close the work item.

Status: open research. This is not yet a verified behavior or security defect.

## Current evidence

[`applyVaultSyncResolution`](../../../packages/core/src/domain/sync/sync-resolution.utils.ts#L35)
accepts local and remote vaults, a review derived from them, a separate
resolution repeating item IDs, and a resolving device ID. Review items also
carry an outer ID while active/deleted projections contain their own IDs.

Recent work correctly moved changed-item selection into the authoritative
review, but the broader core still has contracts that may carry authoritative
state beside derived or repeated views. Some duplication is intentional boundary
denormalization; some may admit impossible combinations or retain secrets longer
than needed. A whole-core inventory is required before changing signatures.

## Standalone research deliverable

Create one append-only inventory covering:

- every exported use-case command and result;
- public service methods and constructor dependencies;
- domain helper signatures with three or more related state parameters;
- nested context/review/resolution structures;
- identifiers repeated at outer and inner levels;
- raw secret-bearing state repeated beside visible/derived views;
- snapshot, descriptor, version-vector, trust, and session context repeated in
  the same call graph;
- every production call site for each candidate.

For each candidate record:

| Field                | Required content                                                           |
| -------------------- | -------------------------------------------------------------------------- |
| Symbol and path      | Exact current declaration                                                  |
| Callers              | All production callers, not only tests                                     |
| Repeated values      | Which fields can describe the same fact                                    |
| Canonical owner      | The value that should be authoritative, if known                           |
| Construction control | Whether untrusted/external callers can create an inconsistent combination  |
| Security/data impact | Drift, stale decisions, secret retention, or only harmless denormalization |
| Existing validation  | Where equality/identity is enforced                                        |
| Recommendation       | Keep, derive, narrow, compose, or investigate                              |
| Migration risk       | Public API, errors, serialization, tests, adapters                         |

## Research procedure

1. Start from package exports and barrels, not file-name guesses.
2. Trace each exported use case into services, domain helpers, ports, and all
   production callers.
3. Search commands include `rg -n "export (type|class|function|interface)"` and
   symbol-specific caller searches.
4. Distinguish hostile-boundary redundancy used for validation from duplicated
   internal authority. Do not remove identity fields needed to bind artifacts.
5. Record whether a mismatch can actually be constructed and what observable
   behavior follows.
6. Rank only evidence-backed candidates. Do not turn aesthetics into findings.

## Required output

The research branch should add the inventory and a proposed sequence of small
follow-up tasks. Each proposed task must identify:

- one established owner;
- exact callers to migrate;
- preserved errors and security checks;
- focused regression tests;
- whether it can be standalone;
- conflicts with Findings 16, 17, or 20.

Do not refactor production signatures in the research branch. Research and
implementation have different review boundaries.

## Independence and sequencing

The inventory is an independently reviewable read-only slice of work item 20 and
can run alongside narrow fixes 12, 25, 26, and 27. Complete it before broad
provider, codec, or package API redesigns. Its unrelated follow-up refactors are
separate branches, while the boundary-validation work explicitly assigned to
Finding 20 remains part of work item 20.

## Completion criteria

- Every exported command/result and public service is accounted for.
- Every candidate lists all current production callers.
- Intentional validation redundancy is explicitly retained.
- No recommendation relies only on line count or style preference.
- The final proposal contains independently reviewable follow-up packets and a
  dependency order.
