# Password policy and generated-data standards

## PASSWORD-001: Enforce policy only where authorized

- **Requirement:** A new policy MUST NOT be added to an existing workflow unless
  that workflow is explicitly in the accepted policy scope.
- **Scope:** Master passwords, entry passwords, and generated credentials.
- **Reason:** Calculating a score does not authorize rejecting previously valid
  input.
- **Compliant:** Add enforcement to the workflows named by the approved policy.
- **Noncompliant:** Make unlock reject legacy passwords after adding a scorer.
- **Enforcement:** Workflow matrix tests.
- **Exceptions:** None.

## PASSWORD-002: Apply the current master-password policy

- **Requirement:** Initialization, enrollment request and completion, password
  change, and recovery MUST require the maximum accepted local score for each new
  or replacement master password. Unlock and current-password verification MUST
  remain compatible with existing weaker passwords.
- **Scope:** Master-password workflows.
- **Reason:** New protection can improve without locking users out of existing
  data.
- **Compliant:** Validate the replacement password before IDs, crypto, or writes.
- **Noncompliant:** Apply the new-password rule to the current password during
  unlock.
- **Enforcement:** Per-workflow policy and zero-side-effect tests.
- **Exceptions:** None.

## PASSWORD-003: Limit the weak-entry override

- **Requirement:** Entry add and update MUST enforce the current entry-password
  score by default. `allowWeakPassword: true` MUST bypass only that strength
  decision and MUST NOT be persisted.
- **Scope:** Password-entry mutation.
- **Reason:** A caller override must not bypass schema, URL, session, existence,
  sync, or other validation.
- **Compliant:** Continue validating the entry and active session after the
  strength override.
- **Noncompliant:** Skip all entry validation when the flag is true.
- **Enforcement:** Override-scope and persistence tests.
- **Exceptions:** None.

## PASSWORD-004: Keep scoring local and bounded

- **Requirement:** Password scoring MUST run locally without network access or a
  newly added runtime dependency. Its work MUST satisfy the complexity bound in
  the security specification, and it MUST be described as a policy heuristic,
  not an entropy or breach guarantee.
- **Scope:** Password-strength implementation and documentation.
- **Reason:** Password input is secret, and heuristic scoring has known limits.
- **Compliant:** Use the pinned in-repo corpus and deterministic rules.
- **Noncompliant:** Send a password to a breach API or download scoring data at
  runtime.
- **Enforcement:** Dependency, network, complexity, and documentation review.
- **Exceptions:** None.

## DATA-001: Generate source data reproducibly

- **Requirement:** Generated source datasets MUST have a pinned source,
  deterministic generator, and verifier that fails when committed output differs
  from regenerated output.
- **Scope:** Common-password and username source data.
- **Reason:** Generated security data must not depend on an editor's local state.
- **Compliant:** Run the checked-in generator in verification mode.
- **Noncompliant:** Hand-edit the generated corpus.
- **Enforcement:** Generator verification in validation commands.
- **Exceptions:** None.

## DATA-002: Test normalized corpus integrity

- **Requirement:** Corpus tests MUST run the production normalization path and
  verify the exact retained normalized values, cardinality, absence of empty or
  duplicate values, and storage limits. Tests of `RandomSamplerService.pickIndex`
  MUST deterministically preserve its dynamic uint32 bounds, rejection, and
  retry behavior. Cryptographic randomness tests MUST NOT require a fixed seed
  or statistical tolerance.
- **Scope:** Generated password and username datasets.
- **Reason:** Normalization can silently reduce the actual choice set and bias a
  sampler.
- **Compliant:** Verify normalized corpus output, then inject uint32 values that
  exercise sampler acceptance and rejection paths.
- **Noncompliant:** Copy the normalizer into the test or deduplicate only at
  runtime.
- **Enforcement:** Exhaustive corpus and sampler tests.
- **Exceptions:** None.
