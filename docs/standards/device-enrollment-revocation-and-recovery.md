# Device enrollment, revocation, and recovery standards

## DEVICE-001: Keep target private keys on the target

- **Requirement:** An enrolling device MUST generate and retain its private keys.
  Enrollment transport MUST carry only its public request and a response
  encrypted for that target.
- **Scope:** Device enrollment.
- **Reason:** A source device must never possess the target's long-term private
  identity.
- **Compliant:** Authenticate target public keys through the signed transition.
- **Noncompliant:** Generate the target signing key on the authorizing device.
- **Enforcement:** Enrollment artifact and end-to-end workflow tests.
- **Exceptions:** None.

## DEVICE-002: Authenticate every access identity

- **Requirement:** Command, session, access material, recovery backup, vault,
  device, algorithm suite, signing key, wrapping key, trust identity, revision,
  and generation MUST agree before key derivation or persistence where those
  fields participate in the workflow.
- **Scope:** Enrollment, unlock, password change, and recovery.
- **Reason:** A valid record for another identity must not authorize this one.
- **Compliant:** Reject a backup whose device ID differs from its access material.
- **Noncompliant:** Validate only the vault ID before deriving a protection key.
- **Enforcement:** Mismatch matrix and pre-effect tests.
- **Exceptions:** Fields not present in the owning protocol.

## DEVICE-003: Treat access material and backup as one pair

- **Requirement:** Device access material and its recovery backup MUST be read and
  replaced atomically. Revisions MUST be positive safe integers, and a
  replacement MUST be the exact successor of the authenticated pair.
- **Scope:** Local device-access persistence.
- **Reason:** A mixed-generation pair can make recovery or normal unlock
  authorize the wrong state.
- **Compliant:** Password change rotates both records to revision `n + 1`.
- **Noncompliant:** Update the backup while leaving access material at revision
  `n`.
- **Enforcement:** Adapter atomicity, replay, and revision-boundary tests.
- **Exceptions:** Initial creation uses the declared initial revision.

## DEVICE-004: Rotate vault access after revocation

- **Requirement:** Device revocation MUST create a fresh vault master key and
  envelopes only for surviving trusted devices. A revoked identity MUST receive
  no usable envelope for future snapshots.
- **Scope:** Device revocation.
- **Reason:** Removing a trust certificate does not revoke key material already
  held by that device.
- **Compliant:** Advance the vault-key generation and wrap only for survivors.
- **Noncompliant:** Keep using the previous vault master key after revocation.
- **Enforcement:** Revoked-key, generation, and offline-survivor tests.
- **Exceptions:** None.

## DEVICE-005: Keep provider revocation separate

- **Requirement:** Core MUST NOT claim that cloud credentials were revoked
  because vault keys or local configuration changed. Provider credential
  revocation remains pending until the provider adapter supplies the required
  evidence.
- **Scope:** Device and provider revocation workflows.
- **Reason:** Vault cryptography cannot remove credentials managed by a cloud
  provider.
- **Compliant:** Record provider-credential revocation as pending external work.
- **Noncompliant:** Mark it complete after removing the device key slot.
- **Enforcement:** Workflow result and provider-outcome tests.
- **Exceptions:** None.

## DEVICE-006: Consume complete authenticated trust suffixes

- **Requirement:** An offline surviving device MUST verify and consume every
  consecutive transition needed to reach the latest accepted trust and key
  generation. It MUST reject skipped, rewritten, or revoked-authorizer history.
- **Scope:** Enrollment and revocation consumption.
- **Reason:** A survivor may miss several valid transitions while offline.
- **Compliant:** Verify the entire suffix before opening the latest envelope.
- **Noncompliant:** Accept only the last transition without its predecessors.
- **Enforcement:** Multiple-skipped-revocation tests.
- **Exceptions:** None.

## RECOVERY-001: Treat recovery as replacement, not revocation

- **Requirement:** Recovery MUST restore the existing trusted device identity and
  atomically replace its current local access material and backup. Code MUST NOT
  claim that replacement words invalidate retained older backups.
- **Scope:** Device-access recovery.
- **Reason:** Old words and old local records remain usable while that identity
  stays trusted and no independent freshness witness exists.
- **Compliant:** Describe replacement words as protecting the new current backup.
- **Noncompliant:** Return `oldWordsInvalidated: true` after local replacement.
- **Enforcement:** Recovery semantics and rollback tests.
- **Exceptions:** A future true-revocation protocol with an approved independent
  freshness mechanism.

## RECOVERY-002: Do not use local expiry as a trust boundary

- **Requirement:** Core MUST NOT model enrollment expiry as a security boundary
  based only on local time.
- **Scope:** Device enrollment and trust state.
- **Reason:** A hostile or rolled-back client has no trusted time authority.
- **Compliant:** Authenticate enrollment through identities, signatures, and
  current state.
- **Noncompliant:** Accept or reject trust solely from local `expiresAt`.
- **Enforcement:** Domain-model and workflow review.
- **Exceptions:** An approved protocol with a trusted time or freshness source.
