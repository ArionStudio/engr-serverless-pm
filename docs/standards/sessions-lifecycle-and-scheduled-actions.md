# Session, lifecycle, and scheduled-action standards

## SESSION-001: Give every activation a fresh identity

- **Requirement:** Every successful session activation, including same-vault
  reactivation, MUST create a fresh session ID and session payload key.
- **Scope:** Vault session activation.
- **Reason:** Old work must not remain authorized after reactivation.
- **Compliant:** Replace both identifiers when refreshing the active vault.
- **Noncompliant:** Reuse the session ID because the vault ID is unchanged.
- **Enforcement:** Reactivation and stale-operation tests.
- **Exceptions:** None.

## SESSION-002: Separate activation material from mutable payload

- **Requirement:** Session activation material MUST remain immutable for its
  generation. Mutable vault payload MUST be encrypted and updated through an
  atomic session-ID compare-and-set.
- **Scope:** Session repositories and service.
- **Reason:** Stale work must not recreate or overwrite a locked session.
- **Compliant:** Reject a payload update after session removal or replacement.
- **Noncompliant:** Write payload state without comparing the active session ID.
- **Enforcement:** Stale commit and lock-interleaving tests.
- **Exceptions:** None.

## SESSION-003: Serialize the complete lifecycle

- **Requirement:** Activation, mutation, lock, local deletion, enrollment
  rollback, and ownership-sensitive clipboard cleanup MUST share the applicable
  serialized ownership boundary.
- **Scope:** Session and lifecycle workflows.
- **Reason:** Independent locks leave races between operations that modify the
  same active session.
- **Compliant:** Acquire the clipboard-operation lease used by the session
  service before activation cleanup.
- **Noncompliant:** Lock the vault outside the coordinator used by copy actions.
- **Enforcement:** Controlled multi-operation interleaving tests.
- **Exceptions:** Read-only status queries that cannot change ownership.

## SESSION-004: Install lifecycle cleanup for every activation

- **Requirement:** Every workflow that activates a session MUST install the
  required automatic lock task or explicitly use an approved no-activation
  result. Failure after partial activation MUST roll back owned state.
- **Scope:** Initialization, unlock, enrollment, and recovery.
- **Reason:** An active session without cleanup can retain decrypted access
  indefinitely.
- **Compliant:** Roll back initialized records when enrollment activation fails.
- **Noncompliant:** Return an unlocked result after lock-task creation failed.
- **Enforcement:** Activation failure-ordering tests.
- **Exceptions:** None.

## SESSION-005: Authenticate destructive cleanup

- **Requirement:** Cleanup MUST authenticate the exact state it can destroy.
  Scheduled cleanup MUST prove its action ID is current within the task's atomic
  or serialized ownership boundary. Work based on a captured session MUST match
  its session identity and freshness token. Immediate lock or deletion MAY
  target the current session read inside the same serialized boundary; deletion
  MUST also match the requested vault. Clipboard mutation MUST match the current
  value hash, and snapshot restoration MUST use exact authenticated state with
  CAS. A digest or version vector alone MUST NOT prove session or task ownership.
- **Scope:** Lock, deletion, rollback, and scheduled cleanup.
- **Reason:** A stale action must not destroy newer state.
- **Compliant:** Remove a lock task only when its action ID still matches.
- **Noncompliant:** Delete the active session because an old alarm fired.
- **Enforcement:** Stale-action and replacement tests.
- **Exceptions:** None.

## SESSION-006: Prepare rollback while keys are owned

- **Requirement:** A workflow MUST prepare signed rollback state while the active
  session still owns usable keys and before waiting on remote operations.
  Restore MUST use exact snapshot and digest CAS.
- **Scope:** Remote mutations with local rollback.
- **Reason:** Later cleanup or replacement may make the old signing material
  unavailable.
- **Compliant:** Prepare the rollback checkpoint before remote deletion.
- **Noncompliant:** Try to recreate rollback state after removing the session.
- **Enforcement:** Remote-failure and conditional-restore tests.
- **Exceptions:** None.

## TASK-001: Make stale scheduled actions inert

- **Requirement:** A scheduled action proven not current by its initial
  ownership check MUST return without mutation. If that check is indeterminate,
  the action MAY arm its own retry but MUST NOT perform destructive cleanup.
  After ownership is proven, cleanup MAY arm retry state owned by that action
  before risky work. If ownership changes later, it MAY cancel only that retry
  and MUST preserve newer tasks, sessions, and clipboard state. Cleanup MUST
  remove matching metadata before cancelling its alarm.
- **Scope:** Vault lock and clipboard clear tasks.
- **Reason:** Alarm delivery is delayed, repeated, and concurrent with newer
  actions.
- **Compliant:** Recheck the action ID immediately before each conditional change.
- **Noncompliant:** Cancel the alarm first and then attempt metadata removal.
- **Enforcement:** Partial-cleanup tests in both failure orders.
- **Exceptions:** None.
