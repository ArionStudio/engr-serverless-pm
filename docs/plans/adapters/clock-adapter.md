# Clock adapter implementation plan

Status: approved, implemented, and validated on
`feature/extension/remaining-adapters`.

Baseline: `be85b607` (merged core documentation, 2026-09-04).

This document is an implementation plan, not a normative standard. The rules
that constrain the work remain under [`docs/standards`](../../standards/README.md).

## Definition

[`ClockPort`](../../../packages/core/src/ports/system/clock.port.ts) is a
technology-neutral core capability:

```ts
export interface ClockPort {
  now: () => number;
}
```

Core interprets the returned number as Unix epoch milliseconds. It uses the
clock for persisted revision timestamps, clipboard and vault-lock deadlines,
expiry checks, and device-trust events. The port is synchronous and declares no
normalization, monotonic-time guarantee, retry behavior, or custom error.

## Portability and current ownership

`ClockPort` is not a browser-extension contract. Any JavaScript, desktop,
mobile, test, or server runtime can provide a wall clock without changing core.
`SystemClockAdapter` uses the standard `Date.now()` API, so its behavior is
portable across JavaScript runtimes.

The implementation stays under the extension adapters for now because the
extension is the only production client. If a second application needs the same
class, move it to a shared adapter package then. Do not move the port or add a
shared package in advance.

## Pre-implementation gap

The extension had no standalone production adapter for `ClockPort`.
[`clipboard-alarm-runtime.ts`](../../../apps/extension/src/extension/background/clipboard-alarm-runtime.ts)
constructed inline `{ now: () => Date.now() }` objects. The compile-only
[`core-composition-api.typecheck.ts`](../../../apps/extension/src/core-composition-api.typecheck.ts)
fixture accepted an injected clock but did not construct a production one.

## Requirements

- Add the adapter under `apps/extension/src/adapters/system`; core must remain
  free of platform APIs.
- Implement `now()` by delegating to the platform wall clock and return epoch
  milliseconds without caching or transformation.
- Keep construction inert. The constructor may retain an injected time source
  for deterministic testing but must not start a timer or perform I/O.
- Let platform failures propagate. The port does not authorize retries,
  fallback time, validation, or a new error contract.
- Reuse one clock instance within a composition graph. In particular, the
  scheduled-task alarm graph must continue to give its clipboard and vault-lock
  handlers the same clock instance.
- Export the adapter as a named export through the system adapter barrel.
- Preserve the current `ClockPort` contract and all persisted timestamp shapes.

## Required final state

1. Add `apps/extension/src/adapters/system/system-clock.adapter.ts` with a named
   `SystemClockAdapter` class implementing `ClockPort`.
2. Inject a narrow `() => number` source, defaulting to `Date.now`. Call the
   source with no receiver dependency so a test fake and the platform function
   behave identically.
3. Export `SystemClockAdapter` from
   `apps/extension/src/adapters/system/index.ts`.
4. Replace both inline clock objects in `clipboard-alarm-runtime.ts` with
   `SystemClockAdapter` instances. Construct only one instance in the
   composition path shared by both scheduled-task handlers.
5. Leave adapter-local timeout reads such as the offscreen clipboard response
   deadline unchanged; they are not core `ClockPort` wiring.

## Test plan

Add `apps/extension/src/adapters/system/system-clock.adapter.test.ts` and prove
that:

- `now()` returns the exact value from an injected deterministic source;
- each call delegates once and does not cache a previous value;
- a source failure is observable unchanged.

Keep existing core and background policy tests on deterministic fake clocks.
They test expiry behavior, not the platform clock.

Run from the repository root:

```bash
pnpm --filter @lfspm/extension exec vitest run \
  src/adapters/system/system-clock.adapter.test.ts \
  src/extension/background
pnpm --filter @lfspm/extension run type-check
pnpm ext:lint
pnpm ext:build
pnpm --filter @lfspm/extension exec prettier --check \
  src/adapters/system src/extension/background
git diff --check
```

## Acceptance criteria

- `SystemClockAdapter` implements `ClockPort` without changing the core
  interface.
- Background composition contains no inline `ClockPort` implementation.
- Both scheduled-task handlers still share the clock instance owned by their
  composition graph.
- Core contains no `Date.now()` or browser import introduced by this work.
- Focused tests, extension type-check, lint, build, formatting check, and
  `git diff --check` pass.
- No dependency, schema, migration, or compatibility change is introduced.

## Out of scope

- Monotonic elapsed-time measurement or rollback-resistant trusted time.
- Replacing adapter-local deadline calculations that do not cross into core.
- Building the full production core composition root.

## Evidence

- Port: [`clock.port.ts`](../../../packages/core/src/ports/system/clock.port.ts)
- Core consumers:
  [`vault-snapshot.service.ts`](../../../packages/core/src/services/snapshot/vault-snapshot.service.ts),
  [`clipboard-clear.service.ts`](../../../packages/core/src/services/clipboard/clipboard-clear.service.ts),
  and
  [`vault-session-activation.service.ts`](../../../packages/core/src/services/session/vault-session-activation.service.ts)
- Current inline wiring:
  [`clipboard-alarm-runtime.ts`](../../../apps/extension/src/extension/background/clipboard-alarm-runtime.ts)
- Existing scheduled-task implementation, pending the same naming
  reconciliation:
  [`chrome-alarms-scheduled-task.adapter.ts`](../../../apps/extension/src/adapters/system/chrome-alarms-scheduled-task.adapter.ts)
- Applicable standards:
  [`core-architecture.md`](../../standards/core-architecture.md),
  [`ports-adapters-and-runtime-validation.md`](../../standards/ports-adapters-and-runtime-validation.md),
  and
  [`testing-and-validation.md`](../../standards/testing-and-validation.md)
