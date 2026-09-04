# Identifier adapter implementation plan

Status: approved, implemented, and validated on
`feature/extension/remaining-adapters`.

Baseline: `be85b607` (merged core documentation, 2026-09-04).

This document is an implementation plan, not a normative standard. The rules
that constrain the work remain under [`docs/standards`](../../standards/README.md).

## Definition

[`IdPort`](../../../packages/core/src/ports/system/id.port.ts) is a
technology-neutral core capability:

```ts
export interface IdPort {
  generateId: () => Promise<string>;
}
```

Core treats each result as an opaque identity. Generated values become vault,
device, enrollment-request, local-access-generation, session, entry, clipboard
action, and vault-lock action IDs. The current contract does not require UUID
syntax, add an ID-specific error, or authorize retry and fallback behavior.

## Portability and current ownership

`IdPort` is general. A browser extension, desktop application, mobile client,
test suite, or server can provide a different secure ID generator without
changing core.

`WebCryptoIdAdapter` uses the standard `Crypto.randomUUID()` API rather
than a Chrome extension API. It remains under the extension adapters because
the extension is the only production client today. A future runtime may reuse
it when it provides the same standard API, or implement `IdPort` with its own
secure generator.

## Pre-implementation gap

The extension had no standalone production adapter for `IdPort`.
[`clipboard-alarm-runtime.ts`](../../../apps/extension/src/extension/background/clipboard-alarm-runtime.ts)
contained the only production implementation, an inline asynchronous wrapper
around `globalThis.crypto.randomUUID()`. The compile-only
[`core-composition-api.typecheck.ts`](../../../apps/extension/src/core-composition-api.typecheck.ts)
expected an injected `IdPort` but did not construct one.

## Requirements

- Add the adapter under `apps/extension/src/adapters/system`; core must remain
  independent of browser and Web Crypto APIs.
- Use `globalThis.crypto.randomUUID()` as the production source. Do not add a
  dependency or substitute `Math.random` or another weaker fallback.
- Preserve the asynchronous port even though the platform UUID call is
  synchronous.
- Return the generated value unchanged. UUID-format validation is not part of
  the current port contract.
- Let platform failures reject the operation unchanged. Do not conceal entropy
  or runtime failures with retries or fabricated IDs.
- Keep construction inert and allow a narrow injected UUID source for tests.
- Reuse the composed instance when it is supplied to multiple identity-sensitive
  consumers in the same graph.
- Export the adapter as a named export through the system adapter barrel.

## Required final state

1. Add `apps/extension/src/adapters/system/web-crypto-id.adapter.ts` with a named
   `WebCryptoIdAdapter` class implementing `IdPort`.
2. Inject `Pick<Crypto, "randomUUID">`, defaulting to `globalThis.crypto`.
3. Implement `generateId()` as an asynchronous method that returns the exact
   `randomUUID()` result.
4. Export `WebCryptoIdAdapter` from
   `apps/extension/src/adapters/system/index.ts`.
5. Replace the inline `IdPort` in `clipboard-alarm-runtime.ts` with the new
   adapter. The later production composition root must reuse the same instance
   for all use cases and services in that graph.

## Test plan

Add `apps/extension/src/adapters/system/web-crypto-id.adapter.test.ts` and prove
that:

- the injected UUID source is called once per `generateId()` call;
- its exact string is returned through the asynchronous interface;
- consecutive calls request consecutive fresh values rather than cache one;
- a platform exception rejects unchanged.

Do not replace deterministic core fixture IDs with random production values.
Those fixtures deliberately control call order and identity relationships.

Run from the repository root:

```bash
pnpm --filter @lfspm/extension exec vitest run \
  src/adapters/system/web-crypto-id.adapter.test.ts \
  src/extension/background
pnpm --filter @lfspm/extension run type-check
pnpm ext:lint
pnpm ext:build
pnpm --filter @lfspm/extension exec prettier --check \
  src/adapters/system src/extension/background
git diff --check
```

## Acceptance criteria

- `WebCryptoIdAdapter` implements `IdPort` without changing the core interface.
- Background composition contains no inline `IdPort` implementation.
- Every call delegates to the injected or default platform UUID source and
  resolves the exact returned string.
- Platform UUID failures remain observable to callers.
- No weak fallback, format policy, global service registry, or dependency is
  added.
- Focused tests, extension type-check, lint, build, formatting check, and
  `git diff --check` pass.

## Out of scope

- Introducing branded UUID types or changing persisted identity formats.
- Collision detection or repository-backed uniqueness checks.
- Building the full production core composition root.

## Evidence

- Port: [`id.port.ts`](../../../packages/core/src/ports/system/id.port.ts)
- Representative consumers:
  [`initialize-vault.ts`](../../../packages/core/src/use-cases/vault-lifecycle/initialize-vault.ts),
  [`unlocked-vault-session.service.ts`](../../../packages/core/src/services/session/unlocked-vault-session.service.ts),
  [`copy-entry-password.ts`](../../../packages/core/src/use-cases/clipboard/copy-entry-password.ts),
  and
  [`create-device-enrollment-request.ts`](../../../packages/core/src/use-cases/device-trust/create-device-enrollment-request.ts)
- Current inline wiring:
  [`clipboard-alarm-runtime.ts`](../../../apps/extension/src/extension/background/clipboard-alarm-runtime.ts)
- Deterministic fixture:
  [`ports.ts`](../../../packages/core/src/__tests__/fixtures/ports.ts)
- Applicable standards:
  [`core-architecture.md`](../../standards/core-architecture.md),
  [`ports-adapters-and-runtime-validation.md`](../../standards/ports-adapters-and-runtime-validation.md),
  and
  [`repository-and-typescript.md`](../../standards/repository-and-typescript.md)
