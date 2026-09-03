# Use-case and service standards

## APP-001: Validate before effects

- **Requirement:** A workflow MUST validate caller input and cheap domain
  preconditions before generating identifiers, reading secrets, performing
  cryptography, writing repositories, starting sessions, or contacting a
  provider.
- **Scope:** Core use cases and services.
- **Reason:** Invalid input must have no observable or security-sensitive side
  effects.
- **Compliant:** Reject an invalid lock delay before generating an action ID.
- **Noncompliant:** Create a session and then validate the delay.
- **Enforcement:** Failure-ordering tests that assert zero downstream calls.
- **Exceptions:** Validation that requires authenticated state may run after the
  minimum reads needed to authenticate that state.

## APP-002: Reuse the established owner

- **Requirement:** A workflow MUST call the existing domain operation or service
  that owns a shared invariant. It MUST NOT reproduce the sequence locally.
- **Scope:** Core use cases and services.
- **Reason:** Security and rollback behavior must have one implementation owner.
- **Compliant:** Enrollment calls `VaultSnapshotService` to sign and persist.
- **Noncompliant:** Enrollment repeats encryption, signing, digesting, and
  checkpoint persistence.
- **Enforcement:** Duplication and dependency review.
- **Exceptions:** None.

## APP-003: Keep workflow rollback with the workflow

- **Requirement:** A use case MUST own rollback and remote orchestration that is
  specific to its caller-visible workflow. Shared persistence mechanics belong
  at the persistence or service boundary.
- **Scope:** Mutating workflows.
- **Reason:** Generic rollback frameworks hide which state a workflow owns.
- **Compliant:** Enrollment coordinates its upload result and enrollment-record
  rollback while repositories provide atomic CAS operations.
- **Noncompliant:** Add a global transaction framework for unrelated use cases.
- **Enforcement:** Ownership review and failure-path tests.
- **Exceptions:** None.

## APP-004: Attempt independent cleanup

- **Requirement:** Cleanup code MUST attempt every safely independent phase and
  rethrow the earliest meaningful error after those attempts.
- **Scope:** Session, clipboard, alarm, enrollment, and deletion cleanup.
- **Reason:** One cleanup failure must not leave unrelated sensitive state in
  place.
- **Compliant:** Continue with task cancellation and session removal after a
  clipboard-metadata error.
- **Noncompliant:** Return immediately after the first cleanup exception.
- **Enforcement:** Dependency-failure tests with first-error assertions.
- **Exceptions:** A later phase that would be unsafe without a successful
  prerequisite MUST be skipped and reported as incomplete.

## APP-005: Export only meaningful service contracts

- **Requirement:** A service MAY export a type only when it represents a real
  protocol token or handoff used by external composition. Cosmetic `*Params` and
  `*Result` aliases MUST remain internal or be written inline.
- **Scope:** Public services.
- **Reason:** A named public type creates a contract beyond method formatting.
- **Compliant:** Export a session activation authorization token.
- **Noncompliant:** Export a parameter alias used by one internal cleanup method.
- **Enforcement:** Service export and consumer review.
- **Exceptions:** None.

## APP-006: Avoid special-case abstractions

- **Requirement:** Code MUST NOT add a helper, lock, or framework solely to make
  one new path fit when an established owner can perform the operation.
- **Scope:** Core orchestration.
- **Reason:** Special cases split policy and tend to miss established failure
  behavior.
- **Compliant:** Extend the repository's existing atomic cleanup contract.
- **Noncompliant:** Add a process-local `runExclusively` helper for a problem
  that spans browser contexts.
- **Enforcement:** Design and reuse review.
- **Exceptions:** A new invariant that no existing boundary can own.
