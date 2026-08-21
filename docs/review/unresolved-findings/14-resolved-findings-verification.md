# Closure Verification: Findings 15 and 18

Resolution units: **work item 15** and **work item 18**. They share verification
instructions but remain independent work items.

These historical findings are resolved in the current baseline. Keep the
original report as historical evidence, but do not create new implementation
branches unless the closure checks regress.

## Finding 15: exact signed snapshot handoff

### Current resolution

[`VaultSnapshotService.persistUnlockedVault`](../../../packages/core/src/services/snapshot/vault-snapshot.service.ts#L49)
returns the exact signed `snapshot` it atomically saved. Local mutations,
sync resolution, revocation, revocation consumption, and credential-revocation
completion pass that returned object directly to `uploadVaultSnapshot`.
Enrollment similarly uploads the exact in-memory snapshot it saved. The old
save-then-hostile-re-read handoff is no longer present in these flows.

### Closure checks

- Search every `uploadVaultSnapshot` call and verify its snapshot argument is the
  trusted object produced or verified by the same workflow.
- Tests should replace repository state after save and prove the replacement is
  not uploaded.
- No new workflow may call `requireLocalVaultSnapshot` merely to upload after it
  already owns the signed persisted object.

## Finding 18: append-only enrollment/trust history

### Current resolution

The old completed-enrollment proof list was replaced by a signed
[`VaultTrustChain`](../../../packages/core/src/domain/device-trust/vault-trust.ts#L1).
`VaultTrustService` verifies genesis anchoring, previous-certificate digests,
generation increments, authorizer membership, signature validity, identity
changes, key generation, and historical key reuse. Device enrollment and
revocation consumption require trust-chain descent rather than generic sync
resolution.

This provides the append-only authorization history the original finding was
missing. Tests reject chain removal/mutation, disconnected transitions,
re-enrollment of revoked identities, and historical public-key reuse.

### Closure checks

- Existing trust-chain prefixes cannot be removed or mutated.
- Exactly authorized transitions are appended.
- Revoked device IDs and either historical public key cannot be reused.
- Generic sync resolution cannot accept a trust-state change.
- Enrollment and revocation consumption validate the remote chain against the
  locally trusted baseline.

## Verification commands

Run snapshot service, sync-resolution, enrollment/revocation consumption, and
vault-trust tests, followed by `pnpm core:type-check` and the full core suite.
If any closure check lacks direct coverage, add only the missing regression test;
do not reopen the old implementation design automatically.
