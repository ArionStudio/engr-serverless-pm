# Domain modeling standards

## DOMAIN-001: Separate stable types from policy

- **Requirement:** Stable public domain contracts MUST live in their owning
  `.type.ts` modules. Context-specific policy and mutations MUST live in
  separate internal modules.
- **Scope:** Core domain code.
- **Reason:** A stable data contract and the policy applied by one workflow are
  different responsibilities.
- **Compliant:** Export `RawMasterPassword` and keep the new-password policy
  helper internal.
- **Noncompliant:** Put workflow validation inside the public type module.
- **Enforcement:** File placement and barrel review.
- **Exceptions:** A self-validating value object approved as the public contract.

## DOMAIN-002: Do not overstate validation with a brand

- **Requirement:** A policy check MUST return normally or throw. It MUST NOT
  claim to establish a broader raw-input brand when the policy is valid only in
  one context.
- **Scope:** Domain policy validation.
- **Reason:** Unlock input and a newly selected password can share a raw type but
  obey different policies.
- **Compliant:** `assertNewMasterPasswordMeetsPolicy(password): void`.
- **Noncompliant:** Return `StrongMasterPassword` and require it for legacy
  unlock.
- **Enforcement:** Signature and caller review.
- **Exceptions:** A brand whose invariant applies everywhere the value is used.

## DOMAIN-003: Preserve immutable ownership

- **Requirement:** Domain operations MUST treat inputs as immutable. Code that
  retains or returns mutable arrays, byte buffers, descriptors, or version
  vectors MUST clone them unless ownership is explicitly transferred.
- **Scope:** Domain operations and boundary-facing domain values.
- **Reason:** Aliases can mutate an authorization token after it was reviewed.
- **Compliant:** Clone a version vector before retaining it across an `await`.
- **Noncompliant:** Keep the caller's mutable descriptor as a CAS expectation.
- **Enforcement:** Mutation-attempt tests and review.
- **Exceptions:** Frozen values with a documented ownership contract.

## DOMAIN-004: Keep one authoritative representation

- **Requirement:** A model MUST NOT store the same authoritative fact in two
  independently mutable fields. Derived values SHOULD be recomputed from their
  owner.
- **Scope:** Domain and persisted contracts.
- **Reason:** Duplicate authority creates states that cannot be reconciled.
- **Compliant:** Derive the trust-chain tip digest from the verified chain.
- **Noncompliant:** Persist a chain and a separately editable copy of its tip.
- **Enforcement:** Schema and invariant tests.
- **Exceptions:** An authenticated cache with explicit consistency checks.

## DOMAIN-005: Name security state precisely

- **Requirement:** Types MUST distinguish untrusted from decoded, unsigned from
  signed, and historical from currently verified state when the distinction
  controls a security decision. Structural reuse MUST NOT imply verification.
- **Scope:** Security-sensitive domain contracts.
- **Reason:** Type names are part of the review boundary.
- **Compliant:** Use separate `VaultSnapshot` and `VerifiedVaultTrustState` types.
- **Noncompliant:** Name a snapshot-supplied identity `TrustedDevice` before
  verification.
- **Enforcement:** Type and workflow review.
- **Exceptions:** None.

## DOMAIN-006: Return visible projections

- **Requirement:** Public read results MUST return explicit visible projections,
  not decrypted aggregate objects that contain secrets or internal sync state.
- **Scope:** Public use-case results.
- **Reason:** A caller should not receive data it was not designed to display or
  decide upon.
- **Compliant:** Return entry metadata and `passwordChanged` in a sync review.
- **Noncompliant:** Return the decrypted `Vault` to the UI.
- **Enforcement:** Result-type review and secret-exposure tests.
- **Exceptions:** A secret-returning workflow whose stated purpose requires that
  exact secret, such as copying one selected password.
