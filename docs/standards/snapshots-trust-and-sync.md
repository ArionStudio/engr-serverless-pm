# Snapshot, trust, and synchronization standards

## TRUST-001: Verify trust before decryption

- **Requirement:** A workflow MUST authenticate the local trust anchor, verify
  the complete trust chain, verify the snapshot signer, and check rollback state
  before unwrapping the vault master key or decrypting vault content.
- **Scope:** Unlock, sync, enrollment, revocation, and recovery workflows.
- **Reason:** Successful decryption does not establish that an attacker is
  authorized to supply the ciphertext or key envelope.
- **Compliant:** Verify the signed trust chain before selecting the device key
  slot.
- **Noncompliant:** Decrypt first and check signer membership afterward.
- **Enforcement:** Pre-effect trust tests with hostile chains.
- **Exceptions:** None.

## TRUST-002: Keep trust history append-only

- **Requirement:** A trust transition MUST extend the verified preceding chain,
  use the next generation, be authorized by a device trusted in the preceding
  generation, and carry the required valid signature. A device MUST NOT add
  itself and authorize that same transition.
- **Scope:** Device trust transitions.
- **Reason:** Trust cannot be established by the identity seeking admission.
- **Compliant:** An existing trusted device authorizes an enrollment transition.
- **Noncompliant:** Accept a chain that rewrites a historical certificate.
- **Enforcement:** Fork, prefix, authorizer, signature, and generation tests.
- **Exceptions:** The initial self-signed genesis certificate, which MUST be
  pinned by the local trust anchor.

## TRUST-003: Separate content order from trust authority

- **Requirement:** Version vectors MUST order vault content changes. The trust
  anchor and certificate chain MUST authenticate device authority. Code MUST NOT
  use one mechanism as a substitute for the other.
- **Scope:** Snapshot comparison and trust verification.
- **Reason:** Content causality and device authorization answer different
  questions.
- **Compliant:** Compare vectors only after confirming both snapshots belong to
  the same vault and accepted trust state.
- **Noncompliant:** Treat a higher vector as proof that its signer is trusted.
- **Enforcement:** Cross-vault and unauthorized-signer tests.
- **Exceptions:** None.

## TRUST-004: Persist snapshots with rollback checkpoints

- **Requirement:** A signed snapshot and its corresponding authenticated rollback
  checkpoint MUST be persisted through one atomic compare-and-swap contract.
- **Scope:** Local snapshot creation, restoration, and synchronized mutation.
- **Reason:** A checkpoint that does not describe the stored snapshot cannot
  detect rollback.
- **Compliant:** Atomically save the exact snapshot/checkpoint pair.
- **Noncompliant:** Save the snapshot and update the checkpoint later.
- **Enforcement:** Adapter atomicity and partial-failure tests.
- **Exceptions:** None.

## SYNC-001: Support only the accepted mutation modes

- **Requirement:** Local-only mode MAY perform offline local mutations.
  Synchronized mode MUST require one active device and exact local/remote
  synchronization before each mutation. Code MUST NOT add offline divergence,
  automatic branch merging, or a parallel synchronization state machine.
- **Scope:** Vault mutations.
- **Reason:** The current product model deliberately rejects concurrent editing.
- **Compliant:** Block a synchronized mutation when remote state is ahead.
- **Noncompliant:** Mutate locally and queue an automatic merge.
- **Enforcement:** Sync-guard and mutation-use-case tests.
- **Exceptions:** A future product change approved with a revised sync
  specification.

## SYNC-002: Enforce snapshot relations centrally

- **Requirement:** The shared sync guard MUST own relation handling. `equal` MAY
  proceed. `remote_ahead` MUST require explicit verified sync or review.
  `local_ahead` MUST enter upload recovery. Crossed or broken relations MUST fail
  as integrity or unsupported-concurrency errors.
- **Scope:** Synchronized mutations.
- **Reason:** Callers must not interpret the same relation differently.
- **Compliant:** Enrollment and entry mutation call the same guard.
- **Noncompliant:** One caller silently downloads `remote_ahead` state during
  mutation preflight.
- **Enforcement:** Relation-table tests across all synchronized mutations.
- **Exceptions:** None.

## SYNC-003: Preserve exact snapshot identity across upload

- **Requirement:** A workflow that creates, signs, verifies, and persists a
  snapshot MUST pass that exact trusted in-memory snapshot to upload. A manual
  upload that starts from storage MUST fully authenticate the stored snapshot
  against the active session.
- **Scope:** Every upload owner.
- **Reason:** A hostile repository can replace data between save and reload.
- **Compliant:** Upload the snapshot returned by the save operation.
- **Noncompliant:** Reload after save only to recover the upload argument.
- **Enforcement:** Hostile post-save replacement tests.
- **Exceptions:** None.

## SYNC-004: Model remote upload outcomes explicitly

- **Requirement:** Provider upload MUST distinguish committed, definite
  non-commit, and outcome unknown. A generic transport exception MUST NOT be
  classified as definite non-commit.
- **Scope:** Sync provider ports, adapters, and callers.
- **Reason:** A response can be lost after the provider commits a write.
- **Compliant:** Map commit-then-response-loss to outcome unknown.
- **Noncompliant:** Roll back locally after every network exception.
- **Enforcement:** Provider contract and commit-loss tests.
- **Exceptions:** A pre-write preparation failure proven to occur before the
  request starts.

## SYNC-005: Reconcile uncertain uploads

- **Requirement:** On outcome unknown, code MUST retain the new signed local
  snapshot and matching session state, persist encrypted reconciliation intent
  with the exact historical expectation, and block further strict mutations.
  Reconciliation MUST verify the exact trusted remote object before clearing
  intent.
- **Scope:** Upload recovery.
- **Reason:** Rolling back can create a local state older than a write that the
  provider accepted.
- **Compliant:** Report upload pending and compare the remote digest during
  reconciliation.
- **Noncompliant:** Clear pending state because a remote descriptor alone
  matches.
- **Enforcement:** Unknown-outcome, concurrent-staging, and conditional-clear
  tests.
- **Exceptions:** None.

## SYNC-006: Require proof before credential revocation completion

- **Requirement:** Core MUST keep provider credential revocation pending unless
  the adapter reports explicit evidence that the credential no longer exists.
  Generic authorization, signature, network, and throttling failures MUST NOT be
  treated as deletion proof.
- **Scope:** Provider credential revocation.
- **Reason:** Access failure does not establish credential nonexistence.
- **Compliant:** Accept a provider's explicit unknown-key identifier outcome.
- **Noncompliant:** Clear pending state after a generic HTTP 403.
- **Enforcement:** Provider error-classification tests.
- **Exceptions:** None.

## SYNC-007: State rollback limits accurately

- **Requirement:** Documentation MUST state that local checkpoints detect
  snapshot-only rollback, same-version conflicting content, and trust forks, but
  cannot detect coordinated restoration of every local record without an
  independent trusted freshness source.
- **Scope:** Security claims and rollback handling.
- **Reason:** The product is client-only and has no trusted monotonic witness.
- **Compliant:** Report coordinated local rollback as an accepted platform limit.
- **Noncompliant:** Claim complete rollback prevention.
- **Enforcement:** Security documentation review.
- **Exceptions:** A future architecture with an approved external freshness
  source.
