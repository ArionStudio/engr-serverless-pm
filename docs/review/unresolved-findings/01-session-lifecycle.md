# Work Packet: Session Activation and Destructive Cleanup

Findings: 11 and 21.

Resolution unit: **work item 11**, which includes Findings 11, 21, and 23. This
packet owns Findings 21 and 11; continue with the companion
[secret-wipe packet](09-secret-wipe-ownership.md) for Finding 23.

Status: open. The findings share lifecycle ownership but should be delivered as
ordered, independently reviewable slices rather than one broad rewrite.

## Verified current behavior

- [`InitializeVaultUseCase`](../../../packages/core/src/use-cases/vault-lifecycle/initialize-vault.ts#L251)
  saves the initialized vault and activates a hot session, but has no lock delay,
  lock-task repository, or scheduler dependency.
- [`PerformDeviceEnrollmentUseCase`](../../../packages/core/src/use-cases/device-trust/perform-device-enrollment.ts#L386)
  also persists and activates a session without installing an auto-lock task.
- [`UnlockVaultUseCase`](../../../packages/core/src/use-cases/vault-lifecycle/unlock-vault.ts#L284)
  is the only activation path that saves lock metadata, schedules the task, and
  rolls those side effects back if activation fails.
- [`DeleteLocalVaultUseCase`](../../../packages/core/src/use-cases/vault-lifecycle/delete-local-vault.ts#L21)
  removes session state and persisted vault data directly. It does not clear the
  clipboard or cancel/remove clipboard and vault-lock tasks.
- [`LockVaultUseCase`](../../../packages/core/src/use-cases/vault-lifecycle/lock-vault.ts#L32)
  owns the current best-effort clipboard, scheduled-task, lock-metadata, and
  session cleanup sequence.

## Security and correctness impact

An initialization or enrollment session can remain active indefinitely because
no scheduled action owns its expiry. Local deletion can leave a copied password
and scheduled actions behind. A stale lock action can later affect another
session, while deleting persistence before lifecycle cleanup has completed can
remove the data needed for a safe retry.

## Decision gate for Finding 11

Choose one user-visible contract before editing code:

1. Recommended: initialization and enrollment return an unlocked vault and must
   accept the same validated `lockAfterMs` policy as unlock.
2. Alternative: those flows persist the vault but do not activate a session.

Do not retain the current undocumented third behavior: activate without an
expiry. The choice affects command parameters and caller behavior and therefore
must be explicit.

## Reuse map

| Responsibility                                  | Current owner                                        | Decision                                                      |
| ----------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------- |
| Validate lock delay                             | `vaultLockDelayMsSchema` and `UnlockVaultUseCase`    | Reuse one validator/error contract                            |
| Save/schedule lock and roll back scheduling     | `UnlockVaultUseCase`                                 | Extract or extend one activation owner for three real callers |
| Clear clipboard and cancel lock/clipboard tasks | `LockVaultUseCase`                                   | Extract one cleanup owner used by lock and delete             |
| Remove unlocked session safely                  | `UnlockedVaultSessionService.remove`                 | Reuse; do not add direct repository removals                  |
| Remove all persisted vault records              | `VaultLocalRepositoryPort.removePersistedLocalVault` | Keep as the final destructive step                            |

Two focused services are justified if needed: one for activation plus auto-lock,
and one for lifecycle cleanup. Do not make one generic transaction framework.

## Implementation split

### Packet 11A: central cleanup and local deletion

1. Move the reusable cleanup sequence out of the lock use case without changing
   its existing observable error precedence.
2. Make lock and delete call the same cleanup owner.
3. Require the target vault/session identity before cleanup.
4. Attempt clipboard cleanup, scheduled-task cancellation, task-metadata
   removal, and session removal even when an earlier cleanup operation fails.
5. Remove persisted local vault data only after the cleanup owner reaches its
   defined safe state. Preserve the first meaningful failure for the caller.
6. Keep stale scheduled action handling bound to action ID and active session;
   do not let deletion weaken the stale-action guard.

### Packet 11B: auto-lock for every activating workflow

1. Apply the decision gate to initialize and enrollment command contracts.
2. Validate the delay before IDs, secrets, repository reads, or other side
   effects.
3. Reuse the same lock metadata and scheduled task structure as unlock.
4. Order activation as: prepare vault state, install lock metadata, schedule,
   activate session, then return.
5. On scheduling failure, remove metadata and do not activate.
6. On activation failure, cancel the scheduled action, remove metadata, and run
   each workflow's existing persisted-state rollback.

## Required regression tests

- Initialization and enrollment create matching lock metadata and scheduled
  tasks when they activate a session.
- Invalid delay fails before key generation, pending-enrollment reads, or local
  persistence.
- Scheduling failure leaves no active session and no lock metadata.
- Activation failure attempts both scheduled-task and metadata cleanup while
  preserving the activation failure.
- Deletion clears a matching copied password, cancels both task kinds, removes
  task metadata, removes session state, then removes persisted vault data.
- Each cleanup dependency failure proves which later cleanup actions still run
  and whether persisted deletion is intentionally withheld.
- A stale action ID cannot lock a newly activated session.

## Independence and sequencing

This packet is not safe to implement in parallel with Findings 12 or 22 because
all touch initialization, enrollment, unlock, recovery, or password-change
contracts. Implement cleanup before activation so new activation paths reuse the
final cleanup owner. Finding 23 should follow this packet rather than add wiping
to several temporary cleanup paths.

## Non-goals

- Do not redesign all scheduled tasks.
- Do not add UI settings or a global state framework.
- Do not change the accepted complete coordinated rollback limitation.

## Completion evidence

Run the focused lifecycle and enrollment tests, `pnpm core:type-check`, and the
full core suite. Inspect that no activation path calls the raw session activation
service without either an installed expiry or the explicit no-activation
contract.
