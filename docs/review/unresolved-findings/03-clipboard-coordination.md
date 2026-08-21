# Work Packet: Clipboard Coordination and Failure Isolation

Findings: 13 and 14.

Resolution unit: **work item 13**. Both findings are required for closure; do
not dispatch Finding 14 as a separate work item.

Status: resolved on `main` at `07caa03c`. PR
[#88](https://github.com/ArionStudio/engr-serverless-pm/pull/88) completed the
shared clipboard coordinator and lifecycle failure isolation. PR
[#91](https://github.com/ArionStudio/engr-serverless-pm/pull/91) completed the
production offscreen transport and its late-delivery safety checks.

## Verified closure behavior

[`CopyEntryPasswordUseCase`](../../../packages/core/src/use-cases/clipboard/copy-entry-password.ts)
runs its complete task-read, prior-clear, task-save, schedule, and clipboard-write
sequence through `ClipboardOperationCoordinatorPort`. Clipboard alarms and vault
lifecycle cleanup use the same coordinator.

The extension implements that port with
[`WebLocksClipboardOperationCoordinator`](../../../apps/extension/src/adapters/clipboard/web-locks-clipboard-operation-coordinator.ts).
Its fixed, origin-scoped Web Lock serializes independent coordinator instances
across extension contexts. The lease prevents session activation or cleanup
from escaping the same ownership boundary.

[`VaultLifecycleCleanupService`](../../../packages/core/src/services/session/vault-lifecycle-cleanup.service.ts)
records the first task-cleanup error but continues the independent clipboard and
session cleanup paths. Lock-task read failure no longer skips clipboard cleanup,
and the service preserves deterministic first-error precedence.

The production clipboard adapter now communicates with the offscreen document
through `chrome.runtime.sendMessage` and `chrome.runtime.onMessage`. It validates
responses, enforces a five-second request deadline at the receiver, writes exact
clipboard data through the copy event, and clears temporary plaintext and
listeners on every path.

## Work split

### Packet 13A: Finding 14 failure isolation

Implemented by the shared lifecycle cleanup service. The original acceptance
criteria are retained below.

1. Treat vault-lock and clipboard cleanup as independent best-effort operations.
2. A failure to read one metadata repository must not prevent attempting the
   other cleanup path.
3. Preserve stale action-ID behavior: a stale scheduled lock must not remove the
   current session.
4. Continue removing session state when cleanup fails.
5. Define and test deterministic first-error precedence.

This packet can be completed in core without changing a port. Do it before the
coordination redesign, not in parallel with it.

### Packet 13B: Finding 13 atomic clipboard ownership

Implemented by the coordinator port and the origin-scoped Web Locks adapter.
The original design criteria are retained below.

First choose an ownership contract that serializes the entire operation from
reading the current task through writing the new clipboard value. An
unconditional `remove` or a process-local mutex is insufficient unless the
composition root guarantees exactly one coordinator instance and execution
context.

The preferred contract must support these properties:

- only the current action can replace or remove its metadata;
- stale scheduled actions cannot remove newer metadata;
- concurrent copy operations have one deterministic order;
- the task whose hash owns the clipboard is the task that remains scheduled;
- cleanup after a failed schedule/write cannot remove another action's task.

Possible implementations include a repository-backed compare-and-set revision
or an explicit clipboard-operation coordinator port with atomic adapter
semantics. Select one based on the target Chrome storage/background execution
model. Do not claim completion with only an in-memory test mutex.

## Reuse map

| Responsibility                         | Current owner                      | Direction                                                            |
| -------------------------------------- | ---------------------------------- | -------------------------------------------------------------------- |
| Hash comparison and stale action check | `ClipboardClearService`            | Extend; keep one clear decision owner                                |
| Task persistence                       | `ClipboardClearTaskRepositoryPort` | Add conditional/atomic semantics only if selected by the design gate |
| Scheduled action identity              | `ScheduledTaskPort` and `actionId` | Reuse                                                                |
| Copy workflow orchestration            | `CopyEntryPasswordUseCase`         | Route through the selected coordinator                               |
| Lock-triggered clearing                | `LockVaultUseCase`                 | Reuse the same coordinator/clear owner                               |

## Required controlled-interleaving tests

- Two copies both pause after reading the prior task, then resume in both orders.
- One copy pauses after saving metadata while another completes.
- One copy pauses before clipboard write while another completes.
- A stale alarm runs after a newer task is stored.
- Hash mismatch does not unconditionally remove newer metadata.
- Schedule and clipboard-write failures cannot remove another action's task.
- Lock runs during an in-flight copy and leaves either a safely cleared clipboard
  or a correctly owned future clear task.
- Lock-metadata read failure still attempts clipboard cleanup and session
  removal.

## Independence and adapter boundary

Finding 14 landed as the first independently reviewable slice. Finding 13 is
closed because the guarantee now exists in the real extension adapter, not only
in core fixtures. `navigator.locks` provides cross-context serialization, while
the Chrome task repository stores the current ownership record.

## Non-goals

- Do not persist plaintext clipboard values.
- Do not replace action IDs with timestamps as a concurrency control.
- Do not add a generic application-wide locking framework.

## Completion evidence

The final post-merge audit recorded:

- 731 passing core tests and a passing core type-check.
- 412 passing extension tests after the PR #91 deadline regression was added.
- Passing core common-password verification.
- Passing extension type-check, lint, and production build.
- Controlled-interleaving coverage for competing copies, stale alarms, hash
  mismatch, schedule and write failures, and lock during an in-flight copy.
- Adapter coverage proving independent Web Lock coordinator instances serialize
  around shared Chrome task storage.
- A real unpacked Chromium MV3 smoke test that copied a sentinel, ran the
  production scheduled-clear alarm, observed an exactly empty clipboard, and
  confirmed task and alarm cleanup.
- Two consecutive clean post-fix review rounds on PR #91, with CodeRabbit and
  Greptile checks passing at head `88dd7515`.
