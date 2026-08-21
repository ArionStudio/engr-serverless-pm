# Work Packet: Model Outcome-Unknown Remote Uploads

Finding: 17.

Resolution unit: **work item 17**, which includes prerequisite Finding 19.
Complete the companion [descriptor identity packet](06-snapshot-descriptor-vault-identity.md)
before implementing this packet.

Status: open and not a standalone local edit. It changes the sync provider
contract and the observable result of multiple workflows.

## Verified current behavior

[`SyncProviderPort.uploadVaultSnapshot`](../../../packages/core/src/ports/sync/sync-provider.port.ts#L24)
returns `Promise<void>`. It distinguishes only the typed CAS failure
`RemoteVaultSnapshotChangedError`; every other rejection has unknown commit
status.

[`VaultSyncGuardService`](../../../packages/core/src/services/sync/vault-sync-guard.service.ts#L215)
restores the old local snapshot/session for every upload rejection. Apply-sync,
revocation, revocation consumption, and provider-credential completion contain
similar restoration paths. A timeout can therefore leave the new snapshot in
the cloud while local state is rolled back. The next operation sees a remote
state that local code incorrectly treated as uncommitted.

Enrollment now improves one path by returning `syncUpload: "pending"` for
non-CAS failures, but the contract is not consistent across all uploads.

## Required decision before implementation

Define remote write outcomes at the port boundary. At minimum, callers need to
distinguish:

- committed;
- definite non-commit/CAS rejection;
- outcome unknown.

This can be represented by a result union or typed errors, but it must be
documented for every adapter. A generic network exception must never mean
"definitely not committed."

Then define the application contract for outcome unknown. Recommended behavior:

1. Keep the locally committed signed snapshot and matching session state.
2. Return or throw a specific pending/unknown outcome that tells the caller the
   local mutation succeeded but remote reconciliation is required.
3. Let strict synchronization block further mutations until `SyncUploadUseCase`
   confirms equality or reports a conflict.
4. Re-read the descriptor only as reconciliation evidence; do not overwrite a
   changed remote snapshot.

Do not silently report full success, and do not restore old local state unless
the provider proves non-commit.

## Required workflow inventory

Update and test every production upload path, including:

- local mutations through `VaultSyncGuardService`;
- initial sync setup;
- explicit sync upload;
- generic sync resolution;
- enrollment completion;
- device revocation and revocation consumption;
- provider-credential revocation completion.

Use `rg -n "uploadVaultSnapshot\\(" packages/core/src` before and after the
change. Every call site must deliberately handle all outcomes.

## Reuse map

| Responsibility                | Current owner                                       | Direction                                                   |
| ----------------------------- | --------------------------------------------------- | ----------------------------------------------------------- |
| CAS mismatch                  | `RemoteVaultSnapshotChangedError`                   | Preserve as definite non-commit                             |
| Strict-mode mutation blocking | `VaultSyncGuardService`                             | Reuse to prevent writes while local is ahead                |
| Explicit retry/reconciliation | `SyncUploadUseCase`                                 | Reuse rather than adding a second uploader                  |
| Session/local restoration     | `UnlockedVaultSessionService.restorePersistedState` | Use only for proven non-commit or local transaction failure |
| Provider semantics            | `SyncProviderPort` and adapters                     | Make outcome classification explicit                        |

## Required regression tests

- Provider reports committed: local/session/remote remain on the new snapshot.
- Typed CAS rejection: existing conflict behavior remains and rollback occurs
  only where the workflow contract requires it.
- Outcome unknown after a simulated remote commit: local/session are not rolled
  back; a retry recognizes exact equality.
- Outcome unknown without a remote commit: retry uploads with the correct
  expected descriptor.
- Remote changes before reconciliation: conflict is reported without overwrite.
- Each public use case exposes a consistent pending/unknown result or error.
- Cleanup failures do not replace the primary remote-outcome error.

## Dependencies and independence

Complete Finding 19 first so descriptor reconciliation is vault-bound. This
packet also needs a real sync adapter contract; core-only changes cannot prove
network outcome behavior. Do not implement it in parallel with broad Finding 20
or Finding 28 signature refactors.

## Non-goals

- Do not add automatic last-write-wins behavior.
- Do not retry indefinitely inside a use case.
- Do not treat all exceptions as outcome unknown; validation and CAS failures
  can be definite non-commits.

## Completion evidence

Run all sync, enrollment, revocation, and session tests plus adapter integration
tests, `pnpm core:type-check`, and the full core suite. Closure requires a test
where the provider commits remotely and then rejects locally.
