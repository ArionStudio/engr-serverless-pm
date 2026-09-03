# Persistence, atomicity, and concurrency standards

## STATE-001: Persist logical records atomically

- **Requirement:** Records that form one security or lifecycle fact MUST be read,
  compared, and replaced in one atomic repository operation.
- **Scope:** Local persistence adapters and their core ports.
- **Reason:** Partial writes can create combinations that were never authorized.
- **Compliant:** Replace device access material and its recovery backup in one
  transaction.
- **Noncompliant:** Save the material and backup with separate independent calls.
- **Enforcement:** Adapter contract tests with injected failures.
- **Exceptions:** None.

## STATE-002: Compare the exact authorized object

- **Requirement:** A destructive or replacing operation MUST compare every field
  that identifies the exact object authorized earlier, including vault identity,
  descriptor, canonical digest, generation, and related records as applicable.
- **Scope:** CAS and conditional mutation contracts.
- **Reason:** A descriptor alone may identify different content or a different
  vault.
- **Compliant:** Compare the full remote snapshot identity before deletion.
- **Noncompliant:** Treat `null` expected state as unconditional deletion.
- **Enforcement:** Same-descriptor different-digest and different-vault tests.
- **Exceptions:** None.

## STATE-003: Derive checks from one authenticated read

- **Requirement:** A workflow MUST derive validation and mutation expectations
  from one authenticated read. It MUST NOT validate one read and mutate based on
  a later unauthenticated read.
- **Scope:** Hostile local persistence and provider state.
- **Reason:** A boundary can change state between reads.
- **Compliant:** Pass the verified snapshot and its digest into the atomic CAS.
- **Noncompliant:** Verify a snapshot, reload it, and use the reload for upload.
- **Enforcement:** Hostile replacement and TOCTOU tests.
- **Exceptions:** The later read is independently authenticated and the workflow
  explicitly reconciles the change.

## STATE-004: Authenticate CAS authority

- **Requirement:** Code MUST authenticate a checkpoint, snapshot, or metadata
  record before using it as CAS authority. The persistence transaction MUST
  recompute identities derived from the actual stored bytes where possible.
- **Scope:** Security-sensitive local transactions.
- **Reason:** Hostile storage cannot authorize its own replacement.
- **Compliant:** Verify the checkpoint and recompute the stored snapshot digest
  inside the transaction.
- **Noncompliant:** Trust a stored digest field without verifying its source.
- **Enforcement:** Tampered-record adapter tests.
- **Exceptions:** None.

## STATE-005: Match the lock to the contention scope

- **Requirement:** Serialization MUST cover every actor that can mutate the
  protected state. A process-local mutex MUST NOT claim to coordinate multiple
  browser contexts.
- **Scope:** Session, clipboard, scheduled-task, and persistence coordination.
- **Reason:** Chrome extension contexts have separate JavaScript heaps.
- **Compliant:** Use a fixed-name origin-wide Web Lock for cross-context clipboard
  operations.
- **Noncompliant:** Use one service instance's promise queue as the only global
  lock.
- **Enforcement:** Multi-instance controlled-interleaving tests.
- **Exceptions:** State proven to have one process-local owner.

## STATE-006: Preserve newer state on uncertainty

- **Requirement:** If cleanup cannot authenticate ownership, it MUST preserve
  possible newer state and report an explicit incomplete or reconciliation
  outcome.
- **Scope:** Cleanup, rollback, and stale scheduled actions.
- **Reason:** Destructive guessing can remove state created by a newer workflow.
- **Compliant:** Keep a newer task when the action ID no longer matches.
- **Noncompliant:** Delete all session records after an unreadable ownership
  record.
- **Enforcement:** Stale and unreadable-state tests.
- **Exceptions:** None.
