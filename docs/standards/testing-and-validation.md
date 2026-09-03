# Testing and validation standards

## TEST-001: Test the security counterexample

- **Requirement:** A security regression test MUST reproduce the unsafe
  interleaving, hostile replacement, malformed input, or authorization mismatch
  that the code prevents. A happy-path assertion alone is insufficient.
- **Scope:** Security-sensitive fixes.
- **Reason:** Many failures appear only after state changes between valid steps.
- **Compliant:** Replace a saved snapshot before upload and assert the original
  in-memory snapshot is uploaded.
- **Noncompliant:** Assert only that a normal upload succeeds.
- **Enforcement:** Test review against the reported failure.
- **Exceptions:** None.

## TEST-002: Assert ordering and absence of effects

- **Requirement:** Failure-path tests MUST assert the reported error or outcome
  and the exact effects allowed for that path. Pre-effect rejection and actions
  proven stale by their initial ownership check MUST assert zero downstream
  mutation. Later-race stale tests MUST assert only action-owned retry effects
  and preservation of newer state. Failures after partial effects MUST assert
  required rollback and safely independent cleanup. Every test MUST assert that
  effects forbidden for its path did not occur.
- **Scope:** Failure-path tests.
- **Reason:** The right error after the wrong side effect is still a defect.
- **Compliant:** Assert zero downstream calls after an invalid lock delay, and
  assert required rollback after an activation failure.
- **Noncompliant:** Assert only the error class.
- **Enforcement:** Test review.
- **Exceptions:** None.

## TEST-003: Use stateful fakes for stateful contracts

- **Requirement:** Tests SHOULD use small stubs for stateless behavior and
  canonical in-memory adapters for transactional, CAS, persistence, or lifecycle
  behavior. They MUST NOT build a parallel mock architecture that bypasses real
  preconditions.
- **Scope:** Core and adapter tests.
- **Reason:** A call-count mock cannot prove atomic state transitions.
- **Compliant:** Seed a real in-memory snapshot repository for enrollment tests.
- **Noncompliant:** Mock snapshot persistence as an unconditional success.
- **Enforcement:** Fixture and test-design review.
- **Exceptions:** A focused unit test that does not depend on stateful behavior.

## TEST-004: Keep fixtures internally consistent

- **Requirement:** Stateful fixtures MUST preserve the same invariants as
  production records, including snapshot, checkpoint, digest, trust, revision,
  and generation relationships.
- **Scope:** Shared test fixtures and in-memory adapters.
- **Reason:** Invalid fixtures can make correct production checks appear broken
  or bypass the intended path.
- **Compliant:** Generate a snapshot and matching checkpoint through shared test
  builders.
- **Noncompliant:** Edit the snapshot vector without updating its digest.
- **Enforcement:** Fixture contract tests.
- **Exceptions:** A test that explicitly names and isolates the malformed field.

## TEST-005: Test the real adapter boundary

- **Requirement:** A port or runtime-boundary change MUST include tests for its
  production adapter when that adapter exists. Core fixtures alone MUST NOT be
  used to claim adapter or end-to-end completion.
- **Scope:** Cross-package contracts and runtime integration.
- **Reason:** Serialization, SDK behavior, browser APIs, and transactions fail
  outside the core fake.
- **Compliant:** Test IndexedDB atomic CAS and an unpacked extension clipboard
  flow.
- **Noncompliant:** Close an adapter acceptance criterion with only a core mock.
- **Enforcement:** Acceptance-criterion and test-location review.
- **Exceptions:** A missing adapter must be reported as residual risk rather than
  silently treated as complete.

## TEST-006: Place tests with their real owner

- **Requirement:** Behavior tests SHOULD be colocated with production modules.
  Reusable fixtures belong under explicit `__tests__/fixtures` directories.
  Cross-module integration tests belong at the boundary they exercise.
- **Scope:** Test file organization.
- **Reason:** Test placement should reveal which contract owns the behavior.
- **Compliant:** Keep a codec test beside its codec and shared port fakes in the
  core fixture directory.
- **Noncompliant:** Put all tests in one top-level folder unrelated to ownership.
- **Enforcement:** File-placement review.
- **Exceptions:** Tooling that requires a fixed test directory.

## TEST-007: Validate in proportion to the change

- **Requirement:** During implementation, run focused checks after coherent
  edits. Before completion, run the full affected package gates. Cross-package
  changes MUST cover core and extension type-checks, tests, lint, build, source
  verification where relevant, formatting, and `git diff --check`.
- **Scope:** Change validation.
- **Reason:** Focused checks shorten feedback, while the final gate catches
  contract and bundling failures.
- **Compliant:** Run focused session tests, then the complete core and extension
  gates before handoff.
- **Noncompliant:** Rerun only the newest test file and claim the package is
  validated.
- **Enforcement:** Handoff and pull-request evidence.
- **Exceptions:** A failed or unavailable gate must be reported explicitly.
